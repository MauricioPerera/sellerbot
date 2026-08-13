import { test } from "node:test";
import assert from "node:assert/strict";
import { importCatalog } from "./import_catalog.ts";
import { openCatalogDb } from "./catalog_db.ts";

const HEADER =
  "ID,Type,SKU,Name,description,Sale price,Regular price,Categories,Images,Parent,Attribute 1 name,Attribute 1 value(s)";

function csv(rows: string[]): string {
  return [HEADER, ...rows].join("\n") + "\n";
}

const TWO_PRODUCT_CSV = csv([
  '17,variable,MH01,Chaz Kangeroo Hoodie,"<p>Hoodie.</p>",,,,"https://example.com/a.jpg",,Size,XS|S|M|L',
  '11,variation,MH01-L-Black,Chaz Kangeroo Hoodie-L-Black,,,"52.00",,,MH01,Size,L',
]);

test("importCatalog inserts all rows and resolves parentSku to the real parent id", () => {
  const db = openCatalogDb(":memory:");
  const result = importCatalog(TWO_PRODUCT_CSV, db);

  assert.deepEqual(result, { total: 2, inserted: 2, skipped: 0 });

  const parent = db.getProductById("17");
  assert.equal(parent?.sku, "MH01");
  assert.equal(parent?.parentId, null);

  const variation = db.getProductById("11");
  assert.equal(variation?.sku, "MH01-L-Black");
  assert.equal(variation?.parentId, "17");
  assert.equal(variation?.priceCents, 5200);

  db.close();
});

test("importCatalog run twice on the same db is idempotent (no duplicates, no throw)", () => {
  const db = openCatalogDb(":memory:");
  const first = importCatalog(TWO_PRODUCT_CSV, db);
  const second = importCatalog(TWO_PRODUCT_CSV, db);

  assert.deepEqual(first, { total: 2, inserted: 2, skipped: 0 });
  assert.deepEqual(second, { total: 2, inserted: 0, skipped: 2 });
  assert.equal(db.getProductById("17")?.sku, "MH01");

  db.close();
});

test("importCatalog leaves parentId null when the Parent SKU has no match in the CSV", () => {
  const db = openCatalogDb(":memory:");
  const orphanCsv = csv([
    '11,variation,MH01-L-Black,Chaz Kangeroo Hoodie-L-Black,,,"52.00",,,MISSING-SKU,,',
  ]);

  const result = importCatalog(orphanCsv, db);

  assert.deepEqual(result, { total: 1, inserted: 1, skipped: 0 });
  assert.equal(db.getProductById("11")?.parentId, null);

  db.close();
});

test("importCatalog inserts a product with no price as priceCents: null", () => {
  const db = openCatalogDb(":memory:");
  const noPriceCsv = csv(["17,variable,MH01,Chaz Kangeroo Hoodie,,,,,,,,"]);

  importCatalog(noPriceCsv, db);

  assert.equal(db.getProductById("17")?.priceCents, null);

  db.close();
});

test("importCatalog throws when a row has an unrecognized product type", () => {
  const db = openCatalogDb(":memory:");
  const badCsv = csv(["1,grouped,SKU1,Name,,,,,,,,"]);

  assert.throws(() => importCatalog(badCsv, db), /unrecognized product type: grouped/);

  db.close();
});
