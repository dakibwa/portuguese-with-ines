import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

// Parse literal data only. Never import, evaluate, install or run the bundle.
const path = process.argv[2];
if (!path) throw new Error("Usage: node scripts/import-expressions.mjs /path/to/current-app/lib/expressions.ts");
const source = ts.createSourceFile(path, readFileSync(resolve(path), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let rows;
for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (declaration.name.getText(source) === "entries" && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) {
      rows = declaration.initializer.elements.map((row) => {
        if (!ts.isArrayLiteralExpression(row)) throw new Error("Expected a literal expression row.");
        return row.elements.map((cell) => {
          if (ts.isStringLiteral(cell)) return cell.text;
          if (ts.isIdentifier(cell) && cell.text === "undefined") return "";
          throw new Error("Only string literals and undefined are allowed in the reference data.");
        });
      });
    }
  }
}
if (!rows?.length) throw new Error("No literal entries array found.");
const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const stamp = "2026-10-13T00:00:00.000Z";
const seen = new Set();
const inserts = rows.map((row, index) => {
  if (row.length < 4 || row.length > 6 || row.slice(0, 4).some((value) => !value.trim())) throw new Error(`Invalid expression row ${index + 1}.`);
  const [expression, literal, equivalent, meaning, note = "", sourceUrl = ""] = row;
  const normalized = expression.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-PT").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (seen.has(normalized)) throw new Error(`Duplicate expression row ${index + 1}.`);
  seen.add(normalized);
  const values = [`original-${index + 1}`, expression, normalized, meaning, equivalent, literal, "[]", note, sourceUrl, "[]", "", ""];
  return `INSERT INTO expressions (id, expression, normalized, meaning_pt, meaning_en, literal_en, examples, notes, source_url, tags, image_url, image_alt, published, sort_order, created_at, updated_at) VALUES (${values.map(quote).join(", ")}, 0, ${index}, ${quote(stamp)}, ${quote(stamp)}) ON CONFLICT(id) DO NOTHING;`;
});
process.stdout.write(`-- Seed: ${rows.length} expressions from ines-idioms-app/current-app/lib/expressions.ts.\n-- Literal data only; all unpublished. Examples and themes were absent in the bundle.\n-- ON CONFLICT preserves any teacher edits when this seed is repeated.\n${inserts.join("\n")}\n`);
