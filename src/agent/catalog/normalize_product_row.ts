import type { CsvRow } from "./parse_woocommerce_csv.ts";

export interface NormalizedRow {
  id: string;
  sku: string;
  name: string;
  type: "simple" | "variable" | "variation";
  description: string;
  priceCents: number | null;
  categories: string[];
  images: string[];
  parentSku: string | null;
  attributes: Array<{ name: string; value: string }>;
}

const PRODUCT_TYPES: ReadonlySet<string> = new Set([
  "simple",
  "variable",
  "variation",
]);

// Convierte un string decimal de dolar a centavos enteros sin pasar por
// aritmetica de punto flotante: separa parte entera y decimal del string y
// las combina como enteros (ver issue #7: precios SIEMPRE enteros).
function dollarsToCents(raw: string): number {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const frac = dot === -1 ? "" : body.slice(dot + 1);
  const wholeCents = (whole === "" ? 0 : Number(whole)) * 100;
  const fracCents = Number((frac + "00").slice(0, 2));
  const cents = wholeCents + fracCents;
  return negative ? -cents : cents;
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

// Sale price gana sobre Regular price; ambas vacias -> null.
function pickPriceCents(row: CsvRow): number | null {
  const sale = row["Sale price"] ?? "";
  if (sale.trim() !== "") {
    return dollarsToCents(sale);
  }
  const regular = row["Regular price"] ?? "";
  if (regular.trim() !== "") {
    return dollarsToCents(regular);
  }
  return null;
}

// Recolecta los pares Attribute N name/value(s) (N: 1..5) con nombre no vacio,
// preservando el value(s) como string crudo (sin partir por `|`).
function collectAttributes(
  row: CsvRow,
): Array<{ name: string; value: string }> {
  const attrs: Array<{ name: string; value: string }> = [];
  for (let n = 1; n <= 5; n++) {
    const name = (row[`Attribute ${n} name`] ?? "").trim();
    if (name === "") {
      continue;
    }
    attrs.push({ name, value: row[`Attribute ${n} value(s)`] ?? "" });
  }
  return attrs;
}

export function normalizeProductRow(row: CsvRow): NormalizedRow {
  const type = row["Type"] ?? "";
  if (!PRODUCT_TYPES.has(type)) {
    throw new Error(`unrecognized product type: ${type}`);
  }
  const parentRaw = (row["Parent"] ?? "").trim();
  return {
    id: row["ID"] ?? "",
    sku: row["SKU"] ?? "",
    name: row["Name"] ?? "",
    type: type as NormalizedRow["type"],
    description: row["description"] ?? "",
    priceCents: pickPriceCents(row),
    categories: splitList(row["Categories"] ?? ""),
    images: splitList(row["Images"] ?? ""),
    parentSku: parentRaw === "" ? null : parentRaw,
    attributes: collectAttributes(row),
  };
}