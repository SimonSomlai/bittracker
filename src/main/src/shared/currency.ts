export type FiatCurrency = "USD" | "EUR" | "GBP";

const DEFAULT_CURRENCY: FiatCurrency = "USD";

export function parseCurrency(value: unknown): FiatCurrency {
  if (value === "EUR" || value === "GBP" || value === "USD") {
    return value;
  }
  return DEFAULT_CURRENCY;
}

