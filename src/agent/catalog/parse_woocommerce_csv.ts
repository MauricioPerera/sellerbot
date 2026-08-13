export type CsvRow = Record<string, string>;

// Devuelve el valor acumulado, el proximo indice a consumir y si se sigue
// dentro de las comillas tras procesar un caracter mientras estamos "in quotes".
// Casos: char != '"' -> se concatena tal cual; '"' seguido de '"' -> una '"'
// literal (escapado RFC4180); '"' solo -> cierra las comillas.
function readQuotedChar(
  csv: string,
  i: number,
  field: string,
): { field: string; next: number; inQuotes: boolean } {
  const c = csv[i];
  if (c !== '"') {
    return { field: field + c, next: i + 1, inQuotes: true };
  }
  if (csv[i + 1] === '"') {
    return { field: field + '"', next: i + 2, inQuotes: true };
  }
  return { field, next: i + 1, inQuotes: false };
}

// Corta el CSV en registros (cada registro es un array de campos crudos),
// respetando comillas dobles RFC4180: comas, newlines y `""` escapados dentro
// de un campo entre comillas. `\r` suelto se descarta (CRLF se cierra via `\n`).
// Una linea completamente vacia no produce registro fantasma.
function splitRecords(csv: string): string[][] {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const len = csv.length;
  while (i < len) {
    const c = csv[i];
    if (inQuotes) {
      const r = readQuotedChar(csv, i, field);
      field = r.field;
      i = r.next;
      inQuotes = r.inQuotes;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      if (row.length > 0 || field !== "") {
        row.push(field);
        records.push(row);
      }
      field = "";
      row = [];
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (row.length > 0 || field !== "") {
    row.push(field);
    records.push(row);
  }
  return records;
}

export function parseWooCommerceCsv(csvText: string): CsvRow[] {
  const records = splitRecords(csvText);
  if (records.length === 0) {
    return [];
  }
  const header = records[0];
  const rows: CsvRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const cells = records[r];
    const obj: CsvRow = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cells[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}