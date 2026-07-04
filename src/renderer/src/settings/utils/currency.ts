export type FiatCurrency = "USD" | "EUR" | "GBP";

export const FIAT_CURRENCIES: FiatCurrency[] = ["USD", "EUR", "GBP"];

export const CURRENCY_SYMBOL: Record<FiatCurrency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
};

export function parseCurrency(value: unknown): FiatCurrency {
  if (value === "EUR" || value === "GBP" || value === "USD") {
    return value;
  }
  return "USD";
}
