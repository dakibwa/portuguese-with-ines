import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// The build and the browser fixtures both see the same sparse checkout.
// Git marks present entries H and excluded entries S. Each index entry
// includes the path, file mode and blob ID from this release commit.
const index = execFileSync("git", ["ls-files", "-t", "--stage", "-z"], { encoding: "utf8" });
const entries = index.split("\0").filter((entry) => entry.startsWith("H "));
if (!entries.some((entry) => entry.endsWith("\tpackage-lock.json"))) throw new Error("Missing site inputs");

const settings = Object.keys(process.env).filter((key) =>
  key.startsWith("NEXT_PUBLIC_") || key.startsWith("QA_") ||
  ["SITE_BASE_PATH", "TZ", "LANG", "NODE_ENV", "NODE_OPTIONS", "ImageOS", "ImageVersion"].includes(key)
).sort().map((key) => [key, process.env[key]]);
const hash = createHash("sha256");
hash.update(JSON.stringify([process.version, process.platform, process.arch, new Date().toISOString().slice(0, 10), settings]));
for (const entry of entries) hash.update("\0" + entry);
console.log("tested-site-v1-" + hash.digest("hex"));
