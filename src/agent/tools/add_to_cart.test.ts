import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCartTool } from "./add_to_cart.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

const catalog: DbProduct[] = [
  {
    id: "145",
    sku: "MH09",
    name: "Abominable Hoodie",
    type: "simple",
    description: "",
    priceCents: 6900,
    categories: [],
    images: [],
    parentId: null,
    attributes: [],
  },
  {
    id: "50",
    sku: "NOP",
    name: "Mystery Item",
    type: "simple",
    description: "",
    priceCents: null,
    categories: [],
    images: [],
    parentId: null,
    attributes: [],
  },
];

test("add_to_cart tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  assert.equal(tool.name, "add_to_cart");
  assert.equal(tool.parameters.required?.includes("product_id"), true);
  db.close();
});

test("add_to_cart tool execute() adds a new item and persists it", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  const result: any = await tool.execute({ product_id: "145", quantity: 2 });
  assert.equal(result.error, undefined);
  assert.equal(result.cart.items.length, 1);
  assert.equal(result.cart.items[0].productId, "145");
  assert.equal(result.cart.items[0].quantity, 2);
  assert.equal(result.cart.items[0].name, "Abominable Hoodie");
  assert.equal(result.cart.items[0].subtotalCents, 13800);

  const persisted = db.getCart("conv-1");
  assert.equal(persisted?.items[0].quantity, 2);
  db.close();
});

test("add_to_cart tool execute() defaults quantity to 1 when omitted", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  const result: any = await tool.execute({ product_id: "145" });
  assert.equal(result.cart.items[0].quantity, 1);
  db.close();
});

test("add_to_cart tool execute() sums quantity when adding the same product twice", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  await tool.execute({ product_id: "145", quantity: 2 });
  const result: any = await tool.execute({ product_id: "145", quantity: 3 });
  assert.equal(result.cart.items.length, 1);
  assert.equal(result.cart.items[0].quantity, 5);
  db.close();
});

test("add_to_cart tool execute() handles a product with no price", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  const result: any = await tool.execute({ product_id: "50" });
  assert.equal(result.cart.items[0].unitPriceCents, null);
  assert.equal(result.cart.totalCents, null);
  db.close();
});

test("add_to_cart tool execute() returns a structured error for an unknown product_id", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  const result: any = await tool.execute({ product_id: "missing" });
  assert.equal(result.error, "no product found with id missing");
  db.close();
});

test("add_to_cart tool execute() rejects a non-string product_id", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  const result: any = await tool.execute({ product_id: 145 });
  assert.equal(result.error, "product_id must be a string");
  db.close();
});

test("add_to_cart tool execute() rejects a non-positive-integer quantity", async () => {
  const db = openCartDb(":memory:");
  const tool = addToCartTool(db, catalog, "conv-1");
  const result: any = await tool.execute({ product_id: "145", quantity: 0 });
  assert.equal(result.error, "quantity must be a positive integer");
  db.close();
});

test("add_to_cart tool execute() keeps separate carts per conversationId", async () => {
  const db = openCartDb(":memory:");
  const toolA = addToCartTool(db, catalog, "conv-a");
  const toolB = addToCartTool(db, catalog, "conv-b");
  await toolA.execute({ product_id: "145", quantity: 1 });
  const resultB: any = await toolB.execute({ product_id: "50", quantity: 1 });
  assert.equal(resultB.cart.items.length, 1);
  assert.equal(resultB.cart.items[0].productId, "50");
  db.close();
});
