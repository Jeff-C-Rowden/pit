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

  it("falls back to ephemeral when Turso errors, logging once", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = await load(async () => { throw new Error("SERVER_ERROR: 401 unauthorized"); });
    const h = m.withDbSync(async (_r: Request) => new Response("ok"));
    expect((await h(new Request("http://x/"))).status).toBe(200);
    expect((await h(new Request("http://x/"))).status).toBe(200);
    expect(m.ledgerMode()).toBe("ephemeral");
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });

  it("uses Blob when Turso is unset", async () => {
    delete process.env.TURSO_DATABASE_URL; delete process.env.TURSO_AUTH_TOKEN;
    blob.get.mockRejectedValue(new Error("404 not found"));
    const m = await load(fakeTurso().exec);
    await m.withDbSync(async (_r: Request) => new Response("ok"))(new Request("http://x/"));
    expect(m.ledgerMode()).toBe("blob");
    expect(blob.get).toHaveBeenCalled();
  });
});
