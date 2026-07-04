export type BtcDisplayUnit = "sats" | "btc";

export const BTC_DISPLAY_UNITS: BtcDisplayUnit[] = ["sats", "btc"];

export const BTC_DISPLAY_UNIT_LABEL: Record<BtcDisplayUnit, string> = {
  sats: "Sats",
  btc: "Bitcoin",
};

export function parseBtcDisplayUnit(value: unknown): BtcDisplayUnit {
  return value === "btc" ? "btc" : "sats";
}
