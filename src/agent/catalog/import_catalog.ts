import type { CatalogDb, DbProduct } from "./catalog_db.ts";
import { parseWooCommerceCsv } from "./parse_woocommerce_csv.ts";
import {
  normalizeProductRow,
  type NormalizedRow,
} from "./normalize_product_row.ts";

export interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
}

// Carga un CSV de WooCommerce en un CatalogDb de forma idempotente. Dos pasadas
// sobre las filas normalizadas: la primera arma el mapa `sku -> id` con TODO el
// CSV (una variacion puede listarse antes que su padre), la segunda resuelve
// `parentSku` a `parentId` real e inserta solo las filas que aun no existen.
export function importCatalog(csvText: string, db: CatalogDb): ImportResult {
  const rows: NormalizedRow[] = parseWooCommerceCsv(csvText).map(
    normalizeProductRow,
  );

  const skuToId = new Map<string, string>();
  for (const row of rows) {
    if (row.sku !== "") {
      skuToId.set(row.sku, row.id);
    }
  }

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (db.getProductById(row.id) !== null) {
      skipped += 1;
      continue;
    }
    const product: DbProduct = {
      id: row.id,
      sku: row.sku,
      name: row.name,
      type: row.type,
      description: row.description,
      priceCents: row.priceCents,
      categories: row.categories,
      images: row.images,
      parentId:
        row.parentSku === null ? null : (skuToId.get(row.parentSku) ?? null),
      attributes: row.attributes,
    };
    db.insertProduct(product);
    inserted += 1;
  }

  return { total: rows.length, inserted, skipped };
}