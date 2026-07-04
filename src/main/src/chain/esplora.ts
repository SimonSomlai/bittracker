import { getEsploraApiUrls } from "../settings/network-env";

interface EsploraTxStatus {
  confirmed: boolean;
  block_height?: number;
  block_time?: number;
}

interface EsploraTxVout {
  scriptpubkey_address?: string;
  value: number;
}

interface EsploraTxVin {
  txid?: string;
  vout?: number;
  prevout?: {
    scriptpubkey_address?: string;
    value: number;
  };
}

export interface EsploraTx {
  txid: string;
  status: EsploraTxStatus;
  vin: EsploraTxVin[];
  vout: EsploraTxVout[];
}

export const ESPLORA_RATE_LIMIT_CODE = "rate_limited" as const;

export class EsploraRateLimitError extends Error {
  readonly code = ESPLORA_RATE_LIMIT_CODE;

  constructor() {
    super(
      "The blockchain explorer is rate-limiting requests. Check back later and try syncing again.",
    );
    this.name = "EsploraRateLimitError";
  }
}

function hostLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl;
  }
}

export class EsploraClient {
  private activeIndex = 0;

  constructor(private readonly baseUrls = getEsploraApiUrls()) {}

  private async fetchPath(path: string): Promise<Response> {
    if (this.baseUrls.length === 0) {
      throw new Error("No Esplora API configured");
    }

    const order = this.baseUrls.map(
      (_, offset) => (this.activeIndex + offset) % this.baseUrls.length,
    );
    let saw429 = false;

    for (let attempt = 0; attempt < order.length; attempt++) {
      const index = order[attempt]!;
      const baseUrl = this.baseUrls[index]!;
      const response = await fetch(`${baseUrl}${path}`);

      if (response.status === 429) {
        saw429 = true;
        const nextIndex = order[attempt + 1];
        if (nextIndex != null) {
          console.warn(
            `[esplora] rate limited on ${hostLabel(baseUrl)}, trying ${hostLabel(this.baseUrls[nextIndex]!)}`,
          );
        }
        continue;
      }

      if (!response.ok) {
        throw new Error(`Esplora request failed (${response.status})`);
      }

      this.activeIndex = index;
      return response;
    }

    if (saw429) {
      throw new EsploraRateLimitError();
    }

    throw new Error("Esplora request failed");
  }

  async getAddressTxs(address: string, lastSeenTxid?: string) {
    const path = lastSeenTxid
      ? `/address/${address}/txs/chain/${lastSeenTxid}`
      : `/address/${address}/txs/chain`;
    const response = await this.fetchPath(path);
    return response.json() as Promise<EsploraTx[]>;
  }

  async getAllAddressTxs(address: string) {
    const txs: EsploraTx[] = [];
    let lastSeenTxid: string | undefined;

    while (true) {
      const page = await this.getAddressTxs(address, lastSeenTxid);
      if (page.length === 0) break;
      txs.push(...page);
      if (page.length < 25) break;
      lastSeenTxid = page[page.length - 1]?.txid;
      if (!lastSeenTxid) break;
    }

    return txs;
  }

  async getTx(txid: string) {
    const response = await this.fetchPath(`/tx/${txid}`);
    return response.json() as Promise<EsploraTx>;
  }
}

export async function fetchCachedTx(
  client: EsploraClient,
  cache: Map<string, EsploraTx>,
  txid: string,
) {
  const cached = cache.get(txid);
  if (cached) return cached;

  const full = await client.getTx(txid);
  cache.set(txid, full);
  return full;
}
