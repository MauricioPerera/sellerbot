import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCartTool } from "./add_to_cart.ts";
import { openCartDb } from "../cart/cart_db.ts";
import { openPromotionsDb } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import type { CreatePromotionInput } from "../promotions/promotions_db.ts";

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
  {
    id: "193",
    sku: "AJX",
    name: "Ajax Full-Zip Sweatshirt",
    type: "simple",
    description: "",
    priceCents: 5500,
    categories: [],
    images: [],
    parentId: null,
    attributes: [],
  },
];

const linkedRule: CreatePromotionInput = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "percentage",
  discountValue: 50,
  combinableWithCoupons: true,
};

test("add_to_cart tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  assert.equal(tool.name, "add_to_cart");
  assert.equal(tool.parameters.required?.includes("product_id"), true);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() adds a new item and persists it", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
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
  promotionsDb.close();
});

test("add_to_cart tool execute() defaults quantity to 1 when omitted", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "145" });
  assert.equal(result.cart.items[0].quantity, 1);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() sums quantity when adding the same product twice", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  await tool.execute({ product_id: "145", quantity: 2 });
  const result: any = await tool.execute({ product_id: "145", quantity: 3 });
  assert.equal(result.cart.items.length, 1);
  assert.equal(result.cart.items[0].quantity, 5);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() handles a product with no price", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "50" });
  assert.equal(result.cart.items[0].unitPriceCents, null);
  assert.equal(result.cart.totalCents, null);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() returns a structured error for an unknown product_id", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "missing" });
  assert.equal(result.error, "no product found with id missing");
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() rejects a non-string product_id", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: 145 });
  assert.equal(result.error, "product_id must be a string");
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() rejects a non-positive-integer quantity", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "145", quantity: 0 });
  assert.equal(result.error, "quantity must be a positive integer");
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() keeps separate carts per conversationId", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const toolA = addToCartTool(db, catalog, promotionsDb, "conv-a");
  const toolB = addToCartTool(db, catalog, promotionsDb, "conv-b");
  await toolA.execute({ product_id: "145", quantity: 1 });
  const resultB: any = await toolB.execute({ product_id: "50", quantity: 1 });
  assert.equal(resultB.cart.items.length, 1);
  assert.equal(resultB.cart.items[0].productId, "50");
  db.close();
  promotionsDb.close();
});

// --- available_promotions (bugfix: no depender de que el LLM llame check_promotions) ---

test("add_to_cart tool execute() includes an empty available_promotions array when nothing applies", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "50" });
  assert.deepEqual(result.available_promotions, []);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() includes the applicable linked promotion after adding its trigger product", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(linkedRule);
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "145" });
  assert.equal(result.available_promotions.length, 1);
  assert.equal(result.available_promotions[0].promotion_id, promotion.id);
  assert.equal(result.available_promotions[0].discount_product_id, "193");
  assert.equal(result.available_promotions[0].discount_product_name, "Ajax Full-Zip Sweatshirt");
  assert.equal(result.available_promotions[0].discount_cents, 2750);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() excludes an inactive promotion from available_promotions", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(linkedRule);
  promotionsDb.setActive(promotion.id, false);
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  const result: any = await tool.execute({ product_id: "145" });
  assert.deepEqual(result.available_promotions, []);
  db.close();
  promotionsDb.close();
});

test("add_to_cart tool execute() reflects available_promotions against the whole cart, not just the item just added", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(linkedRule);
  const tool = addToCartTool(db, catalog, promotionsDb, "conv-1");
  await tool.execute({ product_id: "50" });
  const result: any = await tool.execute({ product_id: "145" });
  assert.equal(result.available_promotions.length, 1);
  assert.equal(result.available_promotions[0].promotion_id, promotion.id);
  db.close();
  promotionsDb.close();
});
