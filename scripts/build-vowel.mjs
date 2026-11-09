import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const local = (name) => path.join(root, name),
  out = local("dist/vowel");
await mkdir(path.join(out, "assets"), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: {
    platform: "src/vowel/platform.tsx",
    teaching: "src/vowel/teaching.tsx",
  },
  outdir: path.join(out, "assets"),
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  sourcemap: false,
  target: "es2022",
  jsx: "automatic",
  chunkNames: "chunks/[name]-[hash]",
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
  alias: {
    "@/lib/tutor": local("src/vowel/tutor.ts"),
    "@/lib/config": local("src/vowel/config.ts"),
    "@/lib/paths": local("src/vowel/paths.ts"),
    "@/lib/lesson-products": local("src/vowel/lesson-products.ts"),
    "@/components/PolicyInformation": local("src/vowel/PolicyInformation.tsx"),
    "@/components/expressions/StudentExpressions": local(
      "src/vowel/NoExpressions.tsx",
    ),
    "@/components/teacher/ReceiptsTab": local("src/vowel/PaymentsTab.tsx"),
    "@/components/teacher/TeacherAccountProfile": local(
      "src/vowel/TeacherProfile.tsx",
    ),
    "next/link": local("src/vowel/Link.tsx"),
  },
});
await cp(local("public/visuals"), path.join(out, "visuals"), {
  recursive: true,
});
const icon = (
  await readFile(local("docs/platform/brand/draft/logo/icon.svg"), "utf8")
)
  .replaceAll("Chapeau", "Vowel")
  .replaceAll("chapeau", "vowel");
await writeFile(path.join(out, "assets/icon.svg"), icon);
await writeFile(
  path.join(out, "index.html"),
  "<!doctype html><title>Vowel</title><p>Vowel is served by its Worker.</p>",
);
console.log("Vowel browser assets built.");
