import { test } from "node:test";
import assert from "node:assert/strict";
import getProductDetailTool from "./get_product_detail.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

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
const VARIATION = product({
  id: "11",
  sku: "MH01-L-Black",
  name: "Chaz Kangeroo Hoodie-L-Black",
  type: "variation",
  parentId: "17",
});
const CATALOG = [PARENT, VARIATION];

test("get_product_detail tool declares its OpenAI-facing shape", () => {
  const tool = getProductDetailTool(CATALOG);
  assert.equal(tool.name, "get_product_detail");
  assert.equal(typeof tool.description, "string");
  assert.deepEqual(tool.parameters, {
    type: "object",
    properties: { product_id: { type: "string" } },
    required: ["product_id"],
    additionalProperties: false,
  });
});

test("get_product_detail tool execute() returns product + variations for a known id", async () => {
  const tool = getProductDetailTool(CATALOG);
  const result = await tool.execute({ product_id: "17" });
  assert.deepEqual(result, { product: PARENT, variations: [VARIATION] });
});

test("get_product_detail tool execute() returns a structured error for an unknown id", async () => {
  const tool = getProductDetailTool(CATALOG);
  const result = await tool.execute({ product_id: "missing" });
  assert.deepEqual(result, { error: "no product found with id missing" });
});

test("get_product_detail tool execute() rejects a non-string product_id", async () => {
  const tool = getProductDetailTool(CATALOG);
  const result = await tool.execute({ product_id: 5 });
  assert.deepEqual(result, { error: "product_id must be a string" });
});
