/**
 * Vercel persistence: the SQLite ledger runs in memory per function instance and is
 * snapshotted to a durable store after every write. Requests are serialized per instance;
 * writes use compare-and-swap so two instances can't silently clobber each other: on
 * conflict we reload the newer snapshot and re-run the request once.
 *
 * Store priority: Postgres (DATABASE_URL, Neon free plan via the Vercel Marketplace) →
 * Turso (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN) → Vercel Blob (BLOB_READ_WRITE_TOKEN).
 * Postgres is the durable account store: if it errors we answer 503 (retry) instead of
 * serving an ephemeral ledger, so a balance can never silently diverge between instances.
 * Turso/Blob keep the older behavior of falling back to an ephemeral per-instance ledger.
 * With neither configured (local dev, tests) or with PIT_DB_PATH set, this is a passthrough.
 */
import { get, put } from "@vercel/blob";
import { clearDirty, getDb, isDirty, loadDbFromImage, serializeDb } from "./db";

type Loaded = { kind: "none" } | { kind: "same" } | { kind: "data"; buf: Buffer; version: string };
interface SnapshotStore {
  name: "postgres" | "turso" | "blob";
  load(known: string | null): Promise<Loaded>;
  /** returns the new version, or null on a CAS conflict */
  save(buf: Buffer, known: string | null): Promise<string | null>;
}

const KEY = "pit/ledger.sqlite";

const blobStore: SnapshotStore = {
  name: "blob",
  async load(known) {
    const res = await get(KEY, { access: "private", useCache: false, ...(known ? { ifNoneMatch: known } : {}) })
      .catch((e: unknown) => {
        if (/not.?found|404/i.test(e instanceof Error ? e.message : String(e))) return null;
        throw e;
      });
    if (!res) return { kind: "none" };
    if (res.statusCode === 304) return { kind: "same" };
    return { kind: "data", buf: Buffer.from(await new Response(res.stream).arrayBuffer()), version: res.blob.etag };
  },
  async save(buf, known) {
    const out = await put(KEY, buf, {
      access: "private", allowOverwrite: true, addRandomSuffix: false,
      contentType: "application/x-sqlite3", ...(known ? { ifMatch: known } : {}),
    }).catch((e: unknown) => {
      if (/precondition|412|etag|already exists|conflicting operation/i.test(e instanceof Error ? e.message : String(e))) return null;
      throw e;
    });
    return out ? out.etag ?? "" : null;
  },
};

type Exec = (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
let tursoExec: Exec | null = null;
let tursoReady = false;

/** test-only: inject a fake libSQL executor */
export function __setTursoExecForTests(fn: Exec | null): void { tursoExec = fn; tursoReady = false; }

async function turso(): Promise<Exec> {
  if (!tursoExec) {
    const { createClient } = await import("@libsql/client/web");
    const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
    tursoExec = async (sql, args = []) => {
      const r = await client.execute({ sql, args: args as never });
      return { rows: r.rows as unknown as Record<string, unknown>[], rowsAffected: r.rowsAffected };
    };
  }
  if (!tursoReady) {
    await tursoExec("CREATE TABLE IF NOT EXISTS pit_snapshots (key TEXT PRIMARY KEY, version INTEGER NOT NULL, image BLOB NOT NULL, updated_at TEXT NOT NULL)");
    tursoReady = true;
  }
  return tursoExec;
}

function toBuf(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (ArrayBuffer.isView(v)) return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
  throw new Error("unexpected snapshot image type");
}

const tursoStore: SnapshotStore = {
  name: "turso",
  async load(known) {
    const x = await turso();
    const v = await x("SELECT version FROM pit_snapshots WHERE key = ?", [KEY]);
    if (!v.rows.length) return { kind: "none" };
    const ver = String(v.rows[0].version);
    if (known === ver) return { kind: "same" };
    const r = await x("SELECT version, image FROM pit_snapshots WHERE key = ?", [KEY]);
    if (!r.rows.length) return { kind: "none" };
    return { kind: "data", buf: toBuf(r.rows[0].image), version: String(r.rows[0].version) };
  },
  async save(buf, known) {
    const x = await turso();
    const now = new Date().toISOString();
    if (known === null) {
      const r = await x("INSERT INTO pit_snapshots (key, version, image, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(key) DO NOTHING", [KEY, buf, now]);
      return r.rowsAffected ? "1" : null;
    }
    const next = Number(known) + 1;
    const r = await x("UPDATE pit_snapshots SET version = ?, image = ?, updated_at = ? WHERE key = ? AND version = ?", [next, buf, now, KEY, Number(known)]);
    return r.rowsAffected ? String(next) : null;
  },
};

type PgQuery = (sql: string, args?: unknown[]) => Promise<Record<string, unknown>[]>;
let pgQuery: PgQuery | null = null;
let pgReady = false;

/** test-only: inject a fake Postgres query function */
export function __setPgQueryForTests(fn: PgQuery | null): void { pgQuery = fn; pgReady = false; }

function pgUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

async function pg(): Promise<PgQuery> {
  if (!pgQuery) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(pgUrl()!);
    pgQuery = async (text, args = []) => (await sql.query(text, args as never[])) as unknown as Record<string, unknown>[];
  }
  if (!pgReady) {
    await pgQuery("CREATE TABLE IF NOT EXISTS pit_snapshots (key TEXT PRIMARY KEY, version BIGINT NOT NULL, image TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    pgReady = true;
  }
  return pgQuery;
}

/** Whole-ledger snapshot in one row (base64 SQLite image) with version compare-and-swap. */
const pgStore: SnapshotStore = {
  name: "postgres",
  async load(known) {
    const q = await pg();
    const v = await q("SELECT version FROM pit_snapshots WHERE key = $1", [KEY]);
    if (!v.length) return { kind: "none" };
    const ver = String(v[0].version);
    if (known === ver) return { kind: "same" };
    const r = await q("SELECT version, image FROM pit_snapshots WHERE key = $1", [KEY]);
    if (!r.length) return { kind: "none" };
    return { kind: "data", buf: Buffer.from(String(r[0].image), "base64"), version: String(r[0].version) };
  },
  async save(buf, known) {
    const q = await pg();
    const img = buf.toString("base64");
    if (known === null) {
      const r = await q("INSERT INTO pit_snapshots (key, version, image, updated_at) VALUES ($1, 1, $2, now()) ON CONFLICT (key) DO NOTHING RETURNING version", [KEY, img]);
      return r.length ? "1" : null;
    }
    const next = Number(known) + 1;
    const r = await q("UPDATE pit_snapshots SET version = $1, image = $2, updated_at = now() WHERE key = $3 AND version = $4 RETURNING version", [next, img, KEY, Number(known)]);
    return r.length ? String(next) : null;
  },
};

function pickStore(): SnapshotStore | null {
  if (process.env.PIT_DB_PATH) return null;
  if (pgUrl()) return pgStore;
  if (process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) return tursoStore;
  if (process.env.BLOB_READ_WRITE_TOKEN) return blobStore;
  return null;
}

let version: string | null = null;
let loaded = false;
let chain: Promise<unknown> = Promise.resolve();
/**
 * Fallback when the store is unusable (403 / suspended / network): keep serving from a
 * per-instance in-memory ledger instead of 500ing every request. Progress made while
 * degraded lives only as long as this function instance (it resets on cold starts).
 */
let degraded: string | null = null;

export function ledgerMode(): "postgres" | "turso" | "blob" | "ephemeral" | "local" {
  const s = pickStore();
  if (!s) return "local";
  return degraded ? "ephemeral" : s.name;
}

class StoreDown extends Error {}

function degrade(stage: string, e: unknown): void {
  if (pickStore()?.name === "postgres") {
    // durable store: never fork into a private ledger; fail this request so the client retries
    console.error(`[pit] postgres ledger ${stage} failed: ${e instanceof Error ? e.message : String(e)}`);
    throw new StoreDown(stage);
  }
  if (degraded) return;
  const msg = e instanceof Error ? e.message : String(e);
  degraded = `${pickStore()?.name} ${stage}: ${msg}`;
  console.error(`[pit] ledger store unavailable (${degraded}); serving an ephemeral in-memory ledger for this instance.`);
  if (!loaded) { loadDbFromImage(null); version = null; loaded = true; }
}

/** test-only */
export function __resetDbSyncForTests(): void { version = null; loaded = false; degraded = null; chain = Promise.resolve(); }

async function syncIn(store: SnapshotStore): Promise<void> {
  const res = await store.load(loaded ? version : null);
  if (res.kind === "same") return;
  if (res.kind === "none") {
    if (!loaded) { loadDbFromImage(null); version = null; loaded = true; }
    return;
  }
  loadDbFromImage(res.buf);
  version = res.version;
  loaded = true;
}

async function syncOut(store: SnapshotStore): Promise<boolean> {
  const v = await store.save(serializeDb(), version);
  if (v === null) return false;
  version = v;
  clearDirty();
  return true;
}

type Handler<A extends unknown[]> = (...args: A) => Promise<Response>;

export function withDbSync<A extends unknown[]>(handler: Handler<A>): Handler<A> {
  return (...args: A) => {
    const store = pickStore();
    if (!store) return handler(...args);
    const run = async (): Promise<Response> => {
      const req = args[0] instanceof Request ? args[0] : null;
      const spare = req ? req.clone() : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!degraded) await syncIn(store).catch((e) => degrade("load", e));
        if (degraded) { getDb(); const res = await handler(...args); clearDirty(); return res; }
        getDb();
        clearDirty();
        const callArgs = (attempt === 0 || !spare ? args : [spare.clone(), ...args.slice(1)]) as A;
        const res = await handler(...callArgs);
        if (!isDirty()) return res;
        let saved: boolean;
        try { saved = await syncOut(store); } catch (e) { degrade("save", e); clearDirty(); return res; }
        if (saved) return res;
        loaded = true; // force a fresh pull of the winning snapshot, then retry
      }
      return new Response(JSON.stringify({ error: "busy, please retry" }), { status: 503 });
    };
    const guarded = async (): Promise<Response> => {
      try { return await run(); } catch (e) {
        if (!(e instanceof StoreDown)) throw e;
        loaded = false; version = null;
        return new Response(JSON.stringify({ error: "The sandbox ledger is briefly unavailable. Please try again." }), { status: 503, headers: { "content-type": "application/json" } });
      }
    };
    const p = chain.then(guarded, guarded);
    chain = p.catch(() => undefined);
    return p;
  };
}
