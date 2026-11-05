import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

describe("withDbSync Blob failure fallback", () => {
  const saved = { ...process.env };
  beforeEach(async () => {
    vi.resetModules();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    delete process.env.PIT_DB_PATH;
    blob.get.mockReset(); blob.put.mockReset();
  });
  afterEach(() => { process.env = { ...saved }; });

  async function load() {
    const sync = await import("@/lib/dbSync");
    const db = await import("@/lib/db");
    sync.__resetDbSyncForTests();
    return { ...sync, ...db };
  }

  it("serves requests from an ephemeral ledger when the Blob GET is 403 (store suspended)", async () => {
    blob.get.mockRejectedValue(new Error("Vercel Blob: Failed to fetch blob: 403 Forbidden"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { withDbSync, ledgerMode, getDb } = await load();
    const h = withDbSync(async (_r: Request) => {
      getDb().exec("CREATE TABLE IF NOT EXISTS t(x)"); getDb().prepare("INSERT INTO t VALUES (1)").run();
      return new Response("ok");
    });
    const r1 = await h(new Request("http://x/"));
    const r2 = await h(new Request("http://x/"));
    expect(r1.status).toBe(200); expect(r2.status).toBe(200);
    expect(ledgerMode()).toBe("ephemeral");
    expect((getDb().prepare("SELECT count(*) c FROM t").get() as { c: number }).c).toBe(2); // state kept in-instance
    expect(err).toHaveBeenCalledTimes(1); // logged once
    expect(blob.get).toHaveBeenCalledTimes(1); // stops hammering Blob
    expect(blob.put).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("does not crash when the Blob PUT fails after a good load", async () => {
    blob.get.mockRejectedValue(new Error("BlobNotFoundError: 404 not found"));
    blob.put.mockRejectedValue(new Error("usage_threshold_limits_reached"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { withDbSync, ledgerMode, getDb } = await load();
    const h = withDbSync(async (_r: Request) => { getDb().exec("CREATE TABLE IF NOT EXISTS t(x)"); getDb().prepare("INSERT INTO t VALUES (1)").run(); return new Response("ok"); });
    const r = await h(new Request("http://x/"));
    expect(r.status).toBe(200);
    expect(blob.put).toHaveBeenCalledTimes(1);
    expect(ledgerMode()).toBe("ephemeral");
    err.mockRestore();
  });

  it("still uses Blob when it is healthy", async () => {
    blob.get.mockRejectedValue(new Error("404 not found"));
    const { withDbSync, ledgerMode } = await load();
    const r = await withDbSync(async (_r: Request) => new Response("ok"))(new Request("http://x/"));
    expect(r.status).toBe(200);
    expect(ledgerMode()).toBe("blob");
  });
});
