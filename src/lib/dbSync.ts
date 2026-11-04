/**
 * Vercel persistence: the SQLite ledger runs in memory per function instance and is
 * snapshotted to a private Vercel Blob after every write. Requests are serialized per
 * instance; writes use ETag compare-and-swap (ifMatch) so two instances can't silently
 * clobber each other: on conflict we reload the newer snapshot and re-run the request once.
 * Without BLOB_READ_WRITE_TOKEN (local dev, Railway, tests) this is a no-op passthrough.
 */
import { get, put } from "@vercel/blob";
import { clearDirty, getDb, isDirty, loadDbFromImage, serializeDb } from "./db";

const KEY = "pit/ledger.sqlite";
let etag: string | null = null;
let loaded = false;
let chain: Promise<unknown> = Promise.resolve();

async function syncIn(): Promise<void> {
  const res = await get(KEY, {
    access: "private",
    useCache: false,
    ...(loaded && etag ? { ifNoneMatch: etag } : {}),
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not.?found|404/i.test(msg)) return null;
    throw e;
  });
  if (!res) {
    if (!loaded) { loadDbFromImage(null); etag = null; loaded = true; }
    return;
  }
  if (res.statusCode === 304) return;
  const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
  loadDbFromImage(buf);
  etag = res.blob.etag;
  loaded = true;
}

async function syncOut(): Promise<boolean> {
  const out = await put(KEY, serializeDb(), {
    access: "private",
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: "application/x-sqlite3",
    ...(etag ? { ifMatch: etag } : {}),
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/precondition|412|etag|already exists/i.test(msg)) return null;
    throw e;
  });
  if (!out) return false;
  etag = out.etag ?? null;
  clearDirty();
  return true;
}

type Handler<A extends unknown[]> = (...args: A) => Promise<Response>;

export function withDbSync<A extends unknown[]>(handler: Handler<A>): Handler<A> {
  if (!process.env.BLOB_READ_WRITE_TOKEN || process.env.PIT_DB_PATH) return handler;
  return (...args: A) => {
    const run = async (): Promise<Response> => {
      const req = args[0] instanceof Request ? args[0] : null;
      const spare = req ? req.clone() : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        await syncIn();
        getDb();
        clearDirty();
        const callArgs = (attempt === 0 || !spare ? args : [spare.clone(), ...args.slice(1)]) as A;
        const res = await handler(...callArgs);
        if (!isDirty()) return res;
        if (await syncOut()) return res;
        loaded = true; // force a fresh pull of the winning snapshot, then retry
      }
      return new Response(JSON.stringify({ error: "busy, please retry" }), { status: 503 });
    };
    const p = chain.then(run, run);
    chain = p.catch(() => undefined);
    return p;
  };
}
