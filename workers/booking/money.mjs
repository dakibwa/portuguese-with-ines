const WHOLE_EUROS = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const EUROS_AND_CENTS = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Euros as the site prints them: whole euros bare ("€25"), anything else with
 * its cents ("€22.50"). Rounding to whole euros told a student on a €22.50
 * agreed rate that each lesson cost €23.
 */
export function formatEuros(cents) {
  const value = Number(cents);
  return (value % 100 === 0 ? WHOLE_EUROS : EUROS_AND_CENTS).format(value / 100);
}
