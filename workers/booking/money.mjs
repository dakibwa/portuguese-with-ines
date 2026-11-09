import { currentTutor } from "./tutor.mjs";

/** The running tutor's currency (Inês charges in euros), whole and with cents, made once per currency. */
const formats = new Map();
function formatsFor(currency) {
  let pair = formats.get(currency);
  if (!pair) {
    const format = (digits) => new Intl.NumberFormat("en-GB", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
    formats.set(currency, pair = { whole: format(0), cents: format(2) });
  }
  return pair;
}

/**
 * Euros as the site prints them: whole euros bare ("€25"), anything else with
 * its cents ("€22.50"). Rounding to whole euros told a student on a €22.50
 * agreed rate that each lesson cost €23.
 */
export function formatEuros(cents) {
  const value = Number(cents);
  const { whole, cents: withCents } = formatsFor(currentTutor().place.currency);
  return (value % 100 === 0 ? whole : withCents).format(value / 100);
}
