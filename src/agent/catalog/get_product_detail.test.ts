import { test } from "node:test";
import assert from "node:assert/strict";
import { getProductDetail } from "./get_product_detail.ts";
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

const PARENT = product({ id: "17", sku: "MH01", name: "Chaz Kangeroo Hoodie", type: "variable" });
const VARIATION_L = product({
  id: "11",
  sku: "MH01-L-Black",
  name: "Chaz Kangeroo Hoodie-L-Black",
  type: "variation",
  parentId: "17",
});
const VARIATION_M = product({
  id: "12",
  sku: "MH01-M-Gray",
  name: "Chaz Kangeroo Hoodie-M-Gray",
  type: "variation",
  parentId: "17",
});
const OTHER_PARENT = product({ id: "20", sku: "YM01", name: "Yoga Mat", type: "simple" });
const OTHER_VARIATION = product({
  id: "21",
  sku: "YM01-Blue",
  name: "Yoga Mat-Blue",
  type: "variation",
  parentId: "20",
});

const ALL = [PARENT, VARIATION_L, VARIATION_M, OTHER_PARENT, OTHER_VARIATION];

test("getProductDetail returns null for an unknown id", () => {
  assert.equal(getProductDetail(ALL, "missing"), null);
});

test("getProductDetail returns the product and its variations, sorted by sku", () => {
  const detail = getProductDetail(ALL, "17");
  assert.deepEqual(detail?.product, PARENT);
  assert.deepEqual(detail?.variations, [VARIATION_L, VARIATION_M]);
});

test("getProductDetail returns an empty variations array for a simple product with no children", () => {
  const detail = getProductDetail(ALL, "20");
  assert.deepEqual(detail?.product, OTHER_PARENT);
  assert.deepEqual(detail?.variations, []);
});

test("getProductDetail on a variation itself returns it with no variations of its own", () => {
  const detail = getProductDetail(ALL, "11");
  assert.deepEqual(detail?.product, VARIATION_L);
  assert.deepEqual(detail?.variations, []);
});

test("getProductDetail never mixes variations belonging to a different parent", () => {
  const detail = getProductDetail(ALL, "17");
  const ids = detail?.variations.map((v) => v.id) ?? [];
  assert.ok(!ids.includes("21"));
});
