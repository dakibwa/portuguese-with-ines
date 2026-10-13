// The teacher's collection. The caller must pass through handleAdmin first.
export class ExpressionProblem extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const problem = (message, status) => { throw new ExpressionProblem(message, status); };
const fields = {
  expression: 240, meaningPt: 2000, meaningEn: 2000, literalEn: 500,
  notes: 2000, sourceUrl: 2048, imageUrl: 2048, imageAlt: 240,
};
const select = `SELECT id, expression, meaning_pt AS meaningPt, meaning_en AS meaningEn,
  literal_en AS literalEn, examples, notes, source_url AS sourceUrl, tags,
  image_url AS imageUrl, image_alt AS imageAlt, published, sort_order AS sortOrder,
  created_at AS createdAt, updated_at AS updatedAt FROM expressions`;
const unpack = (row) => ({ ...row, examples: JSON.parse(row.examples), tags: JSON.parse(row.tags) });
const freshTime = (previous) => new Date(Math.max(Date.now(), Date.parse(previous || 0) + 1 || 0)).toISOString();

function text(value, name, limit) {
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    problem(`${name} must be text, up to ${limit} characters.`);
  }
  // Validate without rewriting accents, quotation marks, spacing or punctuation.
  return value;
}
function list(value, name, count, length) {
  if (!Array.isArray(value) || value.length > count) problem(`${name} can have up to ${count} entries.`);
  return value.map((item) => {
    const result = text(item, name, length);
    if (!result.trim()) problem(`${name} cannot contain empty entries.`);
    return result;
  });
}
function url(value, name, image = false) {
  if (!value) return;
  if (image) {
    if (/^\/visuals\/expressions\/[a-zA-Z0-9_-]+\.webp$/.test(value)) return;
    problem("Use an image from this website’s expressions folder.");
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return;
  } catch { /* Report the field, not its contents. */ }
  problem(`${name} needs an https address.`);
}
function content(body, updating) {
  const allowed = new Set([...Object.keys(fields), "examples", "tags", ...(updating ? ["updatedAt"] : [])]);
  if (Object.keys(body).some((key) => !allowed.has(key))) problem("Unrecognised expression field.");
  const value = {};
  for (const [key, limit] of Object.entries(fields)) value[key] = text(body[key] === undefined ? "" : body[key], key, limit);
  if (!/\p{L}/u.test(value.expression)) problem("Give the expression a name.");
  value.examples = list(body.examples === undefined ? [] : body.examples, "Examples", 2, 1200);
  value.tags = list(body.tags === undefined ? [] : body.tags, "Themes", 8, 40);
  if (new Set(value.tags.map((tag) => tag.trim().toLocaleLowerCase("pt-PT"))).size !== value.tags.length) problem("Use each theme only once.");
  url(value.sourceUrl, "Reference");
  url(value.imageUrl, "Image", true);
  if (value.imageUrl && !value.imageAlt.trim()) problem("Describe the image for someone who cannot see it.");
  value.normalized = value.expression.normalize("NFKD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-PT").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return value;
}
function ready(value) {
  if (!value.meaningPt.trim() || !value.meaningEn.trim() || value.examples.length < 1) {
    problem("Add both meanings and one or two examples before publishing.");
  }
}
function version(body, row, keys) {
  if (Object.keys(body).some((key) => !keys.includes(key))) problem("Unrecognised expression field.");
  if (typeof body.updatedAt !== "string" || body.updatedAt !== row.updatedAt) {
    problem("This expression changed elsewhere. Reload the collection before saving again.", 409);
  }
}
async function get(db, id) {
  const row = await db.prepare(`${select} WHERE id = ?`).bind(id).first();
  if (!row) problem("That expression was not found. Reload the collection.", 404);
  return unpack(row);
}
export async function listExpressions(db) {
  const { results } = await db.prepare(`${select} ORDER BY sort_order, id`).all();
  return results.map(unpack);
}

export async function expressionsRequest(db, method, path, body) {
  if (path === "/admin/expressions" && method === "GET") return { expressions: await listExpressions(db) };
  if (method !== "POST") problem("Not found.", 404);

  if (path === "/admin/expressions/reorder") {
    if (Object.keys(body).some((key) => !["ids", "expectedOrder"].includes(key))) problem("Unrecognised order field.");
    const ids = list(body.ids, "Expression IDs", 500, 100);
    const expected = list(body.expectedOrder, "Previous order", 500, 100);
    if (!ids.length || new Set(ids).size !== ids.length || ids.length !== expected.length ||
        new Set(expected).size !== expected.length || ids.some((id) => !expected.includes(id))) problem("Supply each expression ID once.");
    const rows = await listExpressions(db);
    if (JSON.stringify(rows.map((row) => row.id)) !== JSON.stringify(expected)) problem("The collection changed. Reload it before changing the order.", 409);
    const stamp = freshTime(rows.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, ""));
    // One conditional statement: no half-reordered collection, and no D1
    // parameter-limit problem when the collection grows beyond the seed.
    const result = await db.prepare(`UPDATE expressions SET
      sort_order = (SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE value = expressions.id), updated_at = ?
      WHERE (SELECT json_group_array(id) FROM (SELECT id FROM expressions ORDER BY sort_order, id)) = ?`)
      .bind(JSON.stringify(ids), stamp, JSON.stringify(expected)).run();
    if (!result.meta.changes) problem("The collection changed. Reload it before changing the order.", 409);
    return { expressions: await listExpressions(db) };
  }

  if (path === "/admin/expressions") {
    const value = content(body, false);
    const id = crypto.randomUUID();
    const stamp = new Date().toISOString();
    try {
      await db.prepare(`INSERT INTO expressions
        (id, expression, normalized, meaning_pt, meaning_en, literal_en, examples, notes, source_url, tags,
         image_url, image_alt, published, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM expressions), ?, ?)`)
        .bind(id, value.expression, value.normalized, value.meaningPt, value.meaningEn, value.literalEn,
          JSON.stringify(value.examples), value.notes, value.sourceUrl, JSON.stringify(value.tags), value.imageUrl, value.imageAlt, stamp, stamp).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: expressions.normalized")) problem("That expression is already in the collection.", 409);
      throw error;
    }
    return { expression: await get(db, id) };
  }

  const match = path.match(/^\/admin\/expressions\/([a-zA-Z0-9-]{1,100})(?:\/(publish|delete))?$/);
  if (!match) problem("Not found.", 404);
  const [, id, action] = match;
  const row = await get(db, id);
  version(body, row, action === "publish" ? ["published", "updatedAt"] : action === "delete" ? ["updatedAt"] : [...Object.keys(fields), "examples", "tags", "updatedAt"]);
  const stamp = freshTime(row.updatedAt);
  let result;
  if (action === "delete") {
    result = await db.prepare("DELETE FROM expressions WHERE id = ? AND updated_at = ?").bind(id, body.updatedAt).run();
  } else if (action === "publish") {
    if (body.published !== 0 && body.published !== 1) problem("Published must be 0 or 1.");
    if (body.published) ready(row);
    result = await db.prepare("UPDATE expressions SET published = ?, updated_at = ? WHERE id = ? AND updated_at = ?")
      .bind(body.published, stamp, id, body.updatedAt).run();
  } else {
    const value = content(body, true);
    if (row.published) ready(value);
    try {
      result = await db.prepare(`UPDATE expressions SET expression = ?, normalized = ?, meaning_pt = ?, meaning_en = ?,
        literal_en = ?, examples = ?, notes = ?, source_url = ?, tags = ?, image_url = ?, image_alt = ?, updated_at = ?
        WHERE id = ? AND updated_at = ?`)
        .bind(value.expression, value.normalized, value.meaningPt, value.meaningEn, value.literalEn, JSON.stringify(value.examples),
          value.notes, value.sourceUrl, JSON.stringify(value.tags), value.imageUrl, value.imageAlt, stamp, id, body.updatedAt).run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed: expressions.normalized")) problem("That expression is already in the collection.", 409);
      throw error;
    }
  }
  if (!result.meta.changes) problem("This expression changed elsewhere. Reload the collection before trying again.", 409);
  return action === "delete" ? { ok: true } : { expression: await get(db, id) };
}
