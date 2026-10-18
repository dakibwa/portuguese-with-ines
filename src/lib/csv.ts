/** Quote CSV data and keep user-entered text from becoming a spreadsheet formula. */
export function csvCell(value: string | number) {
  const raw = String(value);
  const text = typeof value === "string" && /^\s*[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
