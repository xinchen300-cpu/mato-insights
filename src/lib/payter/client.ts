const PAYTER_API_BASE = "https://api.mypayter.com/API";

export type PayterCredentials = {
  username: string;
  password: string;
  domain: string;
};

export type PayterAuthToken = {
  tokenId: string;
  expiresIn: number; // seconds
};

export type PayterTransaction = {
  id: string;
  transactionId: number;
  serialNumber: string;
  terminalDomain: string;
  siteDomain: string;
  committedAmount: number; // cents
  currency: string;
  disposition: string;
  complete: boolean;
  ifd?: string;
  itemRef?: string;
  txnTimestamp: string;
  ingestTime: string;
  [key: string]: unknown;
};

export class PayterAuthError extends Error {}

export async function payterAuthenticate(
  credentials: PayterCredentials,
): Promise<PayterAuthToken> {
  const res = await fetch(`${PAYTER_API_BASE}/Auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!res.ok) {
    throw new PayterAuthError(`Payter auth failed with status ${res.status}`);
  }

  const data = await res.json();
  return { tokenId: data.tokenId, expiresIn: data.expiresIn };
}

/**
 * Pages through the Transactions index using the watermark pattern documented
 * in Payter's Data API manual: filter on ingestTime >= fromIngestTime and
 * complete:true, sorted by ingestTime ascending, 1000 rows/page. The same
 * boundary record can reappear across pages (ingestTime isn't unique) — the
 * caller dedupes via upsert on payter_transaction_id.
 */
export async function* payterFetchTransactions(
  tokenId: string,
  fromIngestTime: number,
): AsyncGenerator<PayterTransaction[]> {
  let offset = 0;
  const maxResults = 1000;

  while (true) {
    const res = await fetch(`${PAYTER_API_BASE}/Data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `CURO-TOKEN token="${tokenId}"`,
      },
      body: JSON.stringify({
        index: "Transactions",
        query: "",
        maxResults,
        offset,
        sorts: [{ field: "ingestTime", asc: true }],
        filters: [
          { type: "range", field: "ingestTime", from: fromIngestTime },
          { type: "term", field: "complete", matches: "true" },
        ],
        aggregations: [],
      }),
    });

    if (!res.ok) {
      throw new Error(`Payter data request failed with status ${res.status}`);
    }

    const data = await res.json();
    const documents: PayterTransaction[] = data.documents ?? [];

    if (documents.length === 0) {
      return;
    }

    yield documents;

    if (documents.length < maxResults) {
      return;
    }

    offset += maxResults;
  }
}
