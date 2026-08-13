import { test } from "node:test";
import assert from "node:assert/strict";
import { searchProducts } from "./search_products.ts";
import type { DbProduct } from "./catalog_db.ts";

function product(overrides: Partial<DbProduct>): DbProduct {
  return {
    id: "0",
    sku: "SKU",
    name: "Name",
    type: "simple",
    description: "",
    priceCents: null,
    categories: [],
    images: [],
    parentId: null,
    attributes: [],
    ...overrides,
  };
}

const HOODIE_PARENT = product({
  id: "17",
  sku: "MH01",
  name: "Chaz Kangeroo Hoodie",
  type: "variable",
  description: "Ideal for cold-weather training.",
  categories: ["Clothing>Men>Tops>Hoodies", "Clothing"],
});

const HOODIE_VARIATION = product({
  id: "11",
  sku: "MH01-L-Black",
  name: "Chaz Kangeroo Hoodie-L-Black",
  type: "variation",
  parentId: "17",
  priceCents: 5200,
});

const BRUNO_HOODIE = product({
  id: "20",
  sku: "MB01",
  name: "Bruno Compete Hoodie",
  type: "simple",
  description: "Lightweight training hoodie.",
  categories: ["Clothing>Men>Hoodies"],
  priceCents: 4500,
});

const ABOMINABLE_HOODIE = product({
  id: "30",
  sku: "AB01",
  name: "Abominable Hoodie",
  type: "simple",
  description: "Warm winter hoodie.",
  categories: ["Clothing>Outerwear"],
  priceCents: 6200,
});

const YOGA_MAT = product({
  id: "40",
  sku: "YM01",
  name: "Yoga Mat",
  type: "simple",
  description: "Non-slip exercise mat.",
  categories: ["Fitness>Accessories"],
  priceCents: 2500,
});

const ALL = [HOODIE_PARENT, HOODIE_VARIATION, BRUNO_HOODIE, ABOMINABLE_HOODIE, YOGA_MAT];

test("searchProducts returns an empty array when there are no products", () => {
  assert.deepEqual(searchProducts([], "hoodie"), []);
});

test("searchProducts matches by name token and excludes variations", () => {
  const results = searchProducts(ALL, "hoodie");
  const ids = results.map((r) => r.id);
  assert.deepEqual(ids, ["30", "20", "17"]);
});

test("searchProducts matches by description token too", () => {
  const results = searchProducts(ALL, "training");
  const ids = results.map((r) => r.id);
  assert.deepEqual(ids, ["20", "17"]);
});

test("searchProducts ranks products matching more query tokens first", () => {
  const results = searchProducts(ALL, "winter hoodie");
  const ids = results.map((r) => r.id);
  assert.deepEqual(ids, ["30", "20", "17"]);
});

test("searchProducts is case-insensitive", () => {
  const results = searchProducts(ALL, "HOODIE");
  assert.deepEqual(
    results.map((r) => r.id),
    ["30", "20", "17"],
  );
});

test("searchProducts returns an empty array when no product matches", () => {
  assert.deepEqual(searchProducts(ALL, "nonexistentword"), []);
});

test("searchProducts respects an explicit limit", () => {
  const results = searchProducts(ALL, "hoodie", 2);
  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((r) => r.id),
    ["30", "20"],
  );
});

test("searchProducts does not match a variation even if only its name matches", () => {
  assert.deepEqual(searchProducts(ALL, "black"), []);
});

test("searchProducts result items expose id, sku, name, priceCents and categories", () => {
  const [top] = searchProducts(ALL, "yoga");
  assert.deepEqual(top, {
    id: "40",
    sku: "YM01",
    name: "Yoga Mat",
    priceCents: 2500,
    categories: ["Fitness>Accessories"],
  });
});
