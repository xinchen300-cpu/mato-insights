const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);

// Belgian Excel opens ";"-separated files with "," decimals correctly; the BOM
// makes it read the file as UTF-8 so accents survive.
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "number" ? String(value).replace(".", ",") : value;
    return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return BOM + rows.map((row) => row.map(cell).join(";")).join(CRLF);
}

export function csvResponse(filename: string, rows: (string | number | null | undefined)[][]) {
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
