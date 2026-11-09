export type ImportStudent = { name: string; email: string; phone: string };
/** Quoted CSV and pasted tabular text. Values stay plain text, never formulas. */
export function parseStudents(input: string): ImportStudent[] {
  if (input.length > 500000)
    throw new Error("Choose a smaller list, up to 200 students at a time.");
  const delimiter = input.includes("\t") ? "\t" : ",",
    rows: string[][] = [];
  let cell = "",
    row: string[] = [],
    quoted = false;
  for (let index = 0; index <= input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (
      !quoted &&
      (character === delimiter || character === "\n" || character === undefined)
    ) {
      row.push(cell.replace(/\r$/, "").trim());
      cell = "";
      if (character !== delimiter) {
        if (row.some((value) => value)) rows.push(row);
        row = [];
      }
    } else if (character !== undefined) cell += character;
  }
  if (quoted)
    throw new Error(
      "One quoted field wasn't closed. Check the list or export it as CSV again.",
    );
  if (rows.length > 201)
    throw new Error("Import up to 200 students at a time.");
  if (!rows.length) return [];
  const header = rows[0].map((value) => value.toLowerCase()),
    nameColumn = header.findIndex((value) =>
      /^(?:name|student|student name|full name)$/.test(value),
    ),
    emailColumn = header.findIndex((value) => /e-?mail/.test(value)),
    phoneColumn = header.findIndex((value) =>
      /phone|mobile|whatsapp/.test(value),
    );
  const hasHeader = nameColumn >= 0 || emailColumn >= 0;
  return rows
    .slice(hasHeader ? 1 : 0)
    .map((values) => {
      const emailIndex = hasHeader
        ? emailColumn
        : values.findIndex((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
      const phoneIndex = hasHeader
        ? phoneColumn
        : values.findIndex((value) => /^\+?[\d ()-]{7,}$/.test(value));
      const nameIndex = hasHeader
        ? nameColumn
        : values.findIndex(
            (value, index) =>
              index !== emailIndex && index !== phoneIndex && Boolean(value),
          );
      return {
        name: values[nameIndex] || "",
        email: (values[emailIndex] || "").toLowerCase(),
        phone: values[phoneIndex] || "",
      };
    })
    .filter((student) => student.name || student.email);
}
