// Bundles an audit entry with esbuild, swapping src/lib/rng.ts for the seeded audit RNG.
import { build } from "esbuild";
import path from "path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const [entry, out] = process.argv.slice(2);
const swapRng = {
  name: "swap-rng",
  setup(b) {
    b.onResolve({ filter: /(^|\/)rng$/ }, (args) => {
      return { path: path.join(root, "audit/seededRng.ts") };
    });
    b.onResolve({ filter: /^@\// }, (args) => ({ path: path.join(root, "src", args.path.slice(2)) + ".ts" }));
  },
};
await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out,
  plugins: [swapRng], external: ["better-sqlite3"], target: "node22", logLevel: "warning" });
