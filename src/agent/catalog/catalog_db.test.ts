import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openCatalogDb } from "./catalog_db.ts";
import type { DbProduct } from "./catalog_db.ts";

const sampleProduct: DbProduct = {
  id: "17",
  sku: "MH01",
  name: "Chaz Kangeroo Hoodie",
  type: "variable",
  description: "<p>Ideal for cold-weather training.</p>",
  priceCents: null,
  categories: ["Clothing>Men>Tops", "Clothing"],
  images: ["https://example.com/a.jpg"],
  parentId: null,
  attributes: [{ name: "Size", value: "XS|S|M|L|XL" }],
};

test("openCatalogDb creates the schema and round-trips a product", () => {
  const db = openCatalogDb(":memory:");
  db.insertProduct(sampleProduct);
  assert.deepEqual(db.getProductById("17"), sampleProduct);
  db.close();
});

test("openCatalogDb returns null for an unknown id", () => {
  const db = openCatalogDb(":memory:");
  assert.equal(db.getProductById("missing"), null);
  db.close();
});

test("openCatalogDb round-trips a variation with a parentId and a real priceCents", () => {
  const db = openCatalogDb(":memory:");
  const variation: DbProduct = {
    ...sampleProduct,
    id: "11",
    sku: "MH01-L-Black",
    type: "variation",
    parentId: "17",
    priceCents: 4250,
  };
  db.insertProduct(variation);
  assert.deepEqual(db.getProductById("11"), variation);
  db.close();
});

test("openCatalogDb throws on a duplicate id insert", () => {
  const db = openCatalogDb(":memory:");
  db.insertProduct(sampleProduct);
  assert.throws(() => db.insertProduct(sampleProduct));
  db.close();
});

test("openCatalogDb throws when priceCents is not an integer", () => {
  const db = openCatalogDb(":memory:");
  const invalid: DbProduct = { ...sampleProduct, id: "99", priceCents: 42.5 };
  assert.throws(() => db.insertProduct(invalid), /priceCents must be an integer/);
  db.close();
});

test("openCatalogDb reopening the same file is idempotent and keeps prior data", () => {
  const file = path.join(os.tmpdir(), `catalog-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openCatalogDb(file);
  db1.insertProduct(sampleProduct);
  db1.close();

  const db2 = openCatalogDb(file);
  assert.deepEqual(db2.getProductById("17"), sampleProduct);
  db2.close();

  fs.rmSync(file, { force: true });
});
