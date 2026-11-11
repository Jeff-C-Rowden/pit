import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

/** Fake Postgres: one pit_snapshots table in a Map, honoring the CAS statements ($n params). */
function fakePg() {
  const rows = new Map<string, { version: number; image: string }>();
  let fail = false;
  const query = async (sql: string, args: unknown[] = []) => {
    if (fail) throw new Error("connection refused");
    if (/^CREATE TABLE/i.test(sql)) return [];
    if (/^SELECT/i.test(sql)) { const r = rows.get(String(args[0])); return r ? [{ ...r }] : []; }
    if (/^INSERT/i.test(sql)) {
      const k = String(args[0]);
      if (rows.has(k)) return [];
      rows.set(k, { version: 1, image: String(args[1]) });
      return [{ version: 1 }];
    }
    if (/^UPDATE/i.test(sql)) {
      const [next, image, k, known] = args as [number, string, string, number];
      const r = rows.get(k);
      if (!r || r.version !== known) return [];
      rows.set(k, { version: next, image });
      return [{ version: next }];
    }
    throw new Error("unexpected sql " + sql);
  };
  return { rows, query, setFail: (f: boolean) => { fail = f; } };
}

type Store = ReturnType<typeof fakePg>;

/** A fresh module graph = a separate serverless instance with its own in-memory SQLite. */
async function instance(store: Store) {
  vi.resetModules();
  const sync = await import("@/lib/dbSync");
  sync.__resetDbSyncForTests();
  sync.__setPgQueryForTests(store.query);
  const auth = await import("@/lib/auth");
  const ledger = await import("@/lib/ledger");
  const daily = await import("@/lib/dailyClaim");
  const db = await import("@/lib/db");
  const run = <T>(fn: () => T) => sync.withDbSync(async (_r: Request) => new Response(JSON.stringify(fn() ?? null)))(new Request("http://x/"));
  return { sync, auth, ledger, daily, db, run };
}

const call = async (p: Promise<Response>) => { const r = await p; return { status: r.status, body: JSON.parse(await r.text()) }; };

describe("Postgres (Neon) durable ledger across serverless instances", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://fake";
    process.env.BLOB_READ_WRITE_TOKEN = "suspended";
    delete process.env.PIT_DB_PATH; delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    blob.get.mockReset(); blob.put.mockReset();
  });
  afterEach(() => { process.env = { ...saved }; });

  it("signup on A, add funds on B, claim on C, sign out and back in on D: balance unchanged", async () => {
    const pg = fakePg();
    const A = await instance(pg);
    const u = await call(A.run(() => A.auth.createUser({ email: "jeff@pit.test", password: "hunter22!", displayName: "Jeff", ageConfirmed: true })));
    expect(A.sync.ledgerMode()).toBe("postgres");
    const id = u.body.id as string;
    const login1 = await call(A.run(() => A.auth.loginUser("jeff@pit.test", "hunter22!").token));
    const token1 = login1.body as string;

    const B = await instance(pg);
    const dep = await call(B.run(() => {
      const user = B.auth.getUserByToken(token1);
      if (!user) throw new Error("session lost across instances");
      B.ledger.applyLedger({ userId: user.id, type: "deposit", amountCents: 10000, idempotencyKey: "welcome:" + user.id });
      return B.ledger.getBalance(user.id);
    }));
    expect(dep.body).toBe(10000);

    const C = await instance(pg);
    const claim = await call(C.run(() => C.daily.claimDaily(C.db.getDb(), C.auth.getUserByToken(token1)!.id, new Date())));
    expect(claim.body.ok).toBe(true);
    expect(claim.body.balanceCents).toBe(10000 + 2500);
    // second claim the same Chicago day is refused on yet another instance
    const C2 = await instance(pg);
    const again = await call(C2.run(() => C2.daily.claimDaily(C2.db.getDb(), id, new Date())));
    expect(again.body.ok).toBe(false);

    const D = await instance(pg);
    await call(D.run(() => D.auth.destroySession(token1)));
    const E = await instance(pg);
    expect((await call(E.run(() => E.auth.getUserByToken(token1)?.id ?? null))).body).toBeNull();
    for (let i = 0; i < 3; i++) {
      const F = await instance(pg);
      const back = await call(F.run(() => {
        const { user } = F.auth.loginUser("jeff@pit.test", "hunter22!");
        return F.ledger.getBalance(user.id);
      }));
      expect(back.body).toBe(12500);
    }
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("answers 503 instead of forking an ephemeral ledger when Postgres is down, then recovers", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const pg = fakePg();
    const A = await instance(pg);
    await call(A.run(() => A.auth.createUser({ email: "a@pit.test", password: "hunter22!", displayName: "A", ageConfirmed: true })));
    pg.setFail(true);
    const down = await A.run(() => A.auth.createUser({ email: "b@pit.test", password: "hunter22!", displayName: "B", ageConfirmed: true }));
    expect(down.status).toBe(503);
    expect(A.sync.ledgerMode()).toBe("postgres");
    pg.setFail(false);
    const ok = await call(A.run(() => A.db.getDb().prepare("SELECT count(*) c FROM users").get()));
    expect(ok.body.c).toBe(1); // the failed write never became visible
    err.mockRestore();
  });

  it("prefers Postgres over Turso and Blob", async () => {
    process.env.TURSO_DATABASE_URL = "libsql://x"; process.env.TURSO_AUTH_TOKEN = "t";
    const A = await instance(fakePg());
    await A.run(() => null);
    expect(A.sync.ledgerMode()).toBe("postgres");
  });
});
