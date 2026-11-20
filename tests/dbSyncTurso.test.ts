import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

/** Fake libSQL: one pit_snapshots table held in a Map, honoring the CAS statements. */
function fakeTurso() {
  const rows = new Map<string, { version: number; image: Buffer }>();
  const calls: string[] = [];
  const exec = async (sql: string, args: unknown[] = []) => {
    calls.push(sql);
    if (/^CREATE TABLE/i.test(sql)) return { rows: [], rowsAffected: 0 };
    if (/^SELECT/i.test(sql)) {
      const r = rows.get(String(args[0]));
      return { rows: r ? [{ version: r.version, image: new Uint8Array(r.image) }] : [], rowsAffected: 0 };
    }
    if (/^INSERT/i.test(sql)) {
      const k = String(args[0]);
      if (rows.has(k)) return { rows: [], rowsAffected: 0 };
      rows.set(k, { version: 1, image: Buffer.from(args[1] as Buffer) });
      return { rows: [], rowsAffected: 1 };
    }
    if (/^UPDATE/i.test(sql)) {
      const [next, image, , k, known] = args as [number, Buffer, string, string, number];
      const r = rows.get(k);
      if (!r || r.version !== known) return { rows: [], rowsAffected: 0 };
      rows.set(k, { version: next, image: Buffer.from(image) });
      return { rows: [], rowsAffected: 1 };
    }
    throw new Error("unexpected sql " + sql);
  };
  return { rows, calls, exec };
}

describe("withDbSync with Turso configured", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.TURSO_DATABASE_URL = "libsql://pit-test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test";
    process.env.BLOB_READ_WRITE_TOKEN = "also-set";
    delete process.env.PIT_DB_PATH;
    blob.get.mockReset(); blob.put.mockReset();
  });
  afterEach(() => { process.env = { ...saved }; });

  async function load(exec: ReturnType<typeof fakeTurso>["exec"]) {
    const sync = await import("@/lib/dbSync");
    const db = await import("@/lib/db");
    sync.__resetDbSyncForTests();
    sync.__setTursoExecForTests(exec);
    return { ...sync, ...db };
  }

  it("prefers Turso over Blob and persists writes across a cold start", async () => {
    const t = fakeTurso();
    let m = await load(t.exec);
    const write = m.withDbSync(async (_r: Request) => {
      m.getDb().prepare("INSERT INTO progressive_meters (id, amount_cents, seed_cents, contribution_bps, updated_at) VALUES ('x', 777, 0, 0, 'now')").run();
      return new Response("ok");
    });
    expect((await write(new Request("http://x/"))).status).toBe(200);
    expect(m.ledgerMode()).toBe("turso");
    expect(t.rows.get("pit/ledger.sqlite")?.version).toBe(1);
    expect(blob.get).not.toHaveBeenCalled();
    expect(blob.put).not.toHaveBeenCalled();

    // simulate a new function instance
    vi.resetModules();
    m = await load(t.exec);
    const read = m.withDbSync(async (_r: Request) => {
      const r = m.getDb().prepare("SELECT amount_cents a FROM progressive_meters WHERE id='x'").get() as { a: number } | undefined;
      return new Response(String(r?.a));
    });
    expect(await (await read(new Request("http://x/"))).text()).toBe("777");
  });

  it("detects a CAS conflict, reloads the winner and re-runs once", async () => {
    const t = fakeTurso();
    const m = await load(t.exec);
    const bump = m.withDbSync(async (_r: Request) => {
      m.getDb().prepare("INSERT INTO progressive_hits (id, tier_id, tier_name, amount_cents, created_at) VALUES (lower(hex(randomblob(8))), 't', 'T', 1, 'now')").run();
      return new Response("ok");
    });
    await bump(new Request("http://x/"));
    // another instance writes version 2 behind our back
    const other = t.rows.get("pit/ledger.sqlite")!;
    t.rows.set("pit/ledger.sqlite", { version: 2, image: other.image });
    // our next load sees version 2 (different) so it reloads; save succeeds as 3
    await bump(new Request("http://x/"));
    expect(t.rows.get("pit/ledger.sqlite")?.version).toBe(3);
  });

  it("answers 503 instead of forking an ephemeral ledger when Turso is down, then recovers", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = fakeTurso();
    let down = true;
    const m = await load(async (sql, args) => { if (down) throw new Error("SERVER_ERROR: 503"); return t.exec(sql, args); });
    const ran = vi.fn();
    const h = m.withDbSync(async (_r: Request) => { ran(); return new Response("ok"); });
    const res = await h(new Request("http://x/"));
    expect(res.status).toBe(503);
    expect(ran).not.toHaveBeenCalled();
    expect(m.ledgerMode()).toBe("turso");
    down = false;
    expect((await h(new Request("http://x/"))).status).toBe(200);
    err.mockRestore();
  });

  it("prefers Turso over Postgres when both are configured", async () => {
    process.env.DATABASE_URL = "postgres://neon-over-quota.example/db";
    const t = fakeTurso();
    const m = await load(t.exec);
    await m.withDbSync(async (_r: Request) => {
      m.getDb().prepare("INSERT INTO progressive_meters (id, amount_cents, seed_cents, contribution_bps, updated_at) VALUES ('y', 1, 0, 0, 'now')").run();
      return new Response("ok");
    })(new Request("http://x/"));
    expect(m.ledgerMode()).toBe("turso");
    expect(t.rows.get("pit/ledger.sqlite")?.version).toBe(1);
  });

  it("uses Blob when Turso is unset", async () => {
    delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    blob.get.mockRejectedValue(new Error("404 not found"));
    const m = await load(fakeTurso().exec);
    await m.withDbSync(async (_r: Request) => new Response("ok"))(new Request("http://x/"));
    expect(m.ledgerMode()).toBe("blob");
    expect(blob.get).toHaveBeenCalled();
  });
  it("a cold start that reads 'no snapshot' while one exists never serves the empty ledger (JD2 find)", async () => {
    const t = fakeTurso();
    let m = await load(t.exec);
    await m.withDbSync(async (_r: Request) => {
      m.getDb().prepare("INSERT INTO progressive_meters (id, amount_cents, seed_cents, contribution_bps, updated_at) VALUES ('real', 4242, 0, 0, 'now')").run();
      return new Response("ok");
    })(new Request("http://x/"));
    // New instance whose first version reads come back empty (seen live on a cold-start burst).
    let blanks = 4;
    const flaky = async (sql: string, args: unknown[] = []) => {
      if (/^SELECT version FROM/i.test(sql) && blanks > 0) { blanks--; return { rows: [], rowsAffected: 0 }; }
      return t.exec(sql, args);
    };
    vi.resetModules();
    m = await load(flaky);
    // Handler writes when it finds nothing (like ensureAllTiers seeding meters), then reports what it saw.
    const h = m.withDbSync(async (_r: Request) => {
      const db = m.getDb();
      const r = db.prepare("SELECT amount_cents a FROM progressive_meters WHERE id='real'").get() as { a: number } | undefined;
      if (!r) db.prepare("INSERT OR IGNORE INTO progressive_meters (id, amount_cents, seed_cents, contribution_bps, updated_at) VALUES ('fresh', 1, 0, 0, 'now')").run();
      return new Response(r ? String(r.a) : "EMPTY");
    });
    // 2 blank reads on the first load → fresh DB → write → INSERT conflicts → full reload (2 more blanks)
    // must NOT keep the fresh copy: durable store answers 503.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await h(new Request("http://x/"));
    expect(res.status).toBe(503);
    expect(t.rows.get("pit/ledger.sqlite")?.version).toBe(1);
    // next request reads normally and sees the real ledger
    expect(await (await h(new Request("http://x/"))).text()).toBe("4242");
    err.mockRestore();
  });

  it("one blank read is retried inside load, so the real snapshot is used", async () => {
    const t = fakeTurso();
    let m = await load(t.exec);
    await m.withDbSync(async (_r: Request) => {
      m.getDb().prepare("INSERT INTO progressive_meters (id, amount_cents, seed_cents, contribution_bps, updated_at) VALUES ('real', 99, 0, 0, 'now')").run();
      return new Response("ok");
    })(new Request("http://x/"));
    let blanks = 1;
    vi.resetModules();
    m = await load(async (sql: string, args: unknown[] = []) => {
      if (/^SELECT version FROM/i.test(sql) && blanks > 0) { blanks--; return { rows: [], rowsAffected: 0 }; }
      return t.exec(sql, args);
    });
    const r = await m.withDbSync(async (_r: Request) => {
      const x = m.getDb().prepare("SELECT amount_cents a FROM progressive_meters WHERE id='real'").get() as { a: number } | undefined;
      return new Response(String(x?.a));
    })(new Request("http://x/"));
    expect(await r.text()).toBe("99");
  });
});

describe("Turso client fetch", () => {
  it("creates the libSQL client with a no-store fetch (Next.js must not cache snapshot reads)", async () => {
    vi.resetModules();
    const seen: { cfg?: { fetch?: (u: string, i?: RequestInit) => Promise<Response> } } = {};
    vi.doMock("@libsql/client/web", () => ({
      createClient: (cfg: never) => {
        seen.cfg = cfg;
        return { execute: async () => ({ rows: [], rowsAffected: 0 }) };
      },
    }));
    const saved = { ...process.env };
    process.env.TURSO_DATABASE_URL = "libsql://pit-test.turso.io";
    process.env.TURSO_AUTH_TOKEN = "test";
    delete process.env.PIT_DB_PATH;
    const sync = await import("@/lib/dbSync");
    sync.__resetDbSyncForTests();
    sync.__setTursoExecForTests(null);
    await sync.withDbSync(async (_r: Request) => new Response("ok"))(new Request("http://x/"));
    expect(typeof seen.cfg?.fetch).toBe("function");
    const orig = globalThis.fetch;
    let initSeen: RequestInit | undefined;
    globalThis.fetch = (async (_u: unknown, i?: RequestInit) => { initSeen = i; return new Response("{}"); }) as typeof fetch;
    await seen.cfg!.fetch!("https://pit-test.turso.io/v2/pipeline", { method: "POST" });
    globalThis.fetch = orig;
    expect(initSeen).toMatchObject({ method: "POST", cache: "no-store" });
    vi.doUnmock("@libsql/client/web");
    process.env = { ...saved };
  });
});
