import { test } from "node:test";
import assert from "node:assert/strict";
import searchProductsTool from "./search_products.ts";
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

const YOGA_MAT = product({
  id: "40",
  sku: "YM01",
  name: "Yoga Mat",
  description: "Non-slip exercise mat.",
  categories: ["Fitness"],
  priceCents: 2500,
});

const HOODIE_VARIATION = product({
  id: "11",
  sku: "MH01-L-Black",
  name: "Chaz Hoodie-L-Black",
  type: "variation",
  parentId: "17",
});

const CATALOG = [YOGA_MAT, HOODIE_VARIATION];

test("search_products tool declares its OpenAI-facing shape", () => {
  const tool = searchProductsTool(CATALOG);
  assert.equal(tool.name, "search_products");
  assert.equal(typeof tool.description, "string");
  assert.deepEqual(tool.parameters, {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  });
});

test("search_products tool execute() returns ranked results for a matching query", async () => {
  const tool = searchProductsTool(CATALOG);
  const result = await tool.execute({ query: "yoga" });
  assert.deepEqual(result, {
    results: [{ id: "40", sku: "YM01", name: "Yoga Mat", priceCents: 2500, categories: ["Fitness"] }],
  });
});

test("search_products tool execute() returns an empty results array when nothing matches", async () => {
  const tool = searchProductsTool(CATALOG);
  const result = await tool.execute({ query: "nonexistent" });
  assert.deepEqual(result, { results: [] });
});

test("search_products tool execute() rejects a non-string query", async () => {
  const tool = searchProductsTool(CATALOG);
  const result = await tool.execute({ query: 5 });
  assert.deepEqual(result, { error: "query must be a string" });
});
