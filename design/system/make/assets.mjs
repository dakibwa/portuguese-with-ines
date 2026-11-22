// Copy the site's stylesheets into the design system, so the cards are drawn with the site's
// own styles. Run from anywhere: node design/system/make/assets.mjs [--check]
// --check changes nothing and fails if a copy is behind the site.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const components = join(root, "design/system/project/components");
const check = process.argv.includes("--check");

// in the order the site's pages load them (bundle.css imports them in this order)
const sheets = {
  "globals.css": "src/app/globals.css",
  "workspace.css": "src/app/workspace.css",
  "homework.css": "src/app/homework.css",
  "teacher-schedule.css": "src/app/schedule/teacher-schedule.css",
  "idioms.css": "src/app/idioms/idioms.css",
};

let stale = 0;
for (const [name, source] of Object.entries(sheets)) {
  const want = `/* A copy of ${source}, made by design/system/make/assets.mjs. Do not edit it. */\n` + readFileSync(join(root, source), "utf8");
  const file = join(components, "site", name);
  let have = null;
  try { have = readFileSync(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (have === want) continue;
  if (check) { console.error(`components/site/${name} is behind ${source}: run node design/system/make/assets.mjs`); stale++; continue; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, want);
  console.log(`copied ${source}`);
}
process.exitCode = stale ? 1 : 0;
