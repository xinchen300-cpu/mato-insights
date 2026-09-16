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
  committedAmount?: number; // cents; absent on declined/incomplete transactions
  authorizedAmount?: number;
  requestedAmount?: number;
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
 * boundary record can reappear across pages/windows (ingestTime isn't
 * unique) — the caller dedupes via upsert on payter_transaction_id.
 *
 * Payter's backend rejects offset+maxResults beyond ~10,000 (a standard
 * Elasticsearch/Lucene limit) with an HTTP 400. So instead of paging via
 * offset indefinitely, this restarts the query every 8 pages with an
 * advanced `from` watermark (offset reset to 0) — the same trick as moving
 * to the next sync run, just done proactively within one run.
 */
export async function* payterFetchTransactions(
  tokenId: string,
  fromIngestTime: number,
): AsyncGenerator<PayterTransaction[]> {
  const maxResults = 1000;
  const maxOffsetBeforeRestart = 8000; // stays comfortably under the ~10k window limit

  let currentFrom = fromIngestTime;

  while (true) {
    let offset = 0;
    let maxIngestInWindow = currentFrom;

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
            { type: "range", field: "ingestTime", from: currentFrom },
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
        return; // no more data anywhere
      }

      yield documents;

      for (const doc of documents) {
        const t = new Date(doc.ingestTime).getTime();
        if (t > maxIngestInWindow) maxIngestInWindow = t;
      }

      if (documents.length < maxResults) {
        return; // short page = genuinely the last page of all remaining data
      }

      offset += maxResults;
      if (offset > maxOffsetBeforeRestart) {
        break; // restart this window with an advanced watermark
      }
    }

    currentFrom = maxIngestInWindow;
  }
}
