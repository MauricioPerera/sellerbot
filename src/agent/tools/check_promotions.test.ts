import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPromotionsTool } from "./check_promotions.ts";
import { openCartDb } from "../cart/cart_db.ts";
import { openPromotionsDb } from "../promotions/promotions_db.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { CreatePromotionInput } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

function seededCartDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

const cartWithHoodie: Cart = {
  conversationId: "conv-1",
  items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const catalog: DbProduct[] = [
  {
    id: "145",
    sku: "SKU-145",
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
    id: "193",
    sku: "SKU-193",
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

const rule: CreatePromotionInput = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "percentage",
  discountValue: 50,
  combinableWithCoupons: true,
};

test("check_promotions tool declares its OpenAI-facing shape", () => {
  const cartDb = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  assert.equal(tool.name, "check_promotions");
  assert.deepEqual(tool.parameters.required ?? [], []);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions returns an empty list for an empty cart", async () => {
  const cartDb = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  promotionsDb.createPromotion(rule);
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result.promotions, []);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions returns an applicable active promotion with the resolved discount", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(rule);
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.promotions.length, 1);
  assert.equal(result.promotions[0].promotion_id, promotion.id);
  assert.equal(result.promotions[0].discount_product_id, "193");
  assert.equal(result.promotions[0].discount_product_name, "Ajax Full-Zip Sweatshirt");
  assert.equal(result.promotions[0].discount_cents, 2750);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions excludes an inactive promotion", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(rule);
  promotionsDb.setActive(promotion.id, false);
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result.promotions, []);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions excludes a promotion whose trigger product is not in the cart", async () => {
  const cartDb = seededCartDb({
    conversationId: "conv-1",
    items: [{ productId: "999", name: "Other Item", quantity: 1, unitPriceCents: 1000 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  });
  const promotionsDb = openPromotionsDb(":memory:");
  promotionsDb.createPromotion(rule);
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result.promotions, []);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions excludes a promotion whose discount product is not in the catalog", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  promotionsDb.createPromotion({ ...rule, discountProductId: "missing" });
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result.promotions, []);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions returns multiple applicable promotions", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  promotionsDb.createPromotion(rule);
  promotionsDb.createPromotion({ ...rule, discountType: "fixed", discountValue: 1000 });
  const tool = checkPromotionsTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.promotions.length, 2);
  cartDb.close();
  promotionsDb.close();
});

test("check_promotions never throws", async () => {
  const cartDb = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = checkPromotionsTool(cartDb, promotionsDb, [], "conv-missing");
  await assert.doesNotReject(() => tool.execute({}));
  cartDb.close();
  promotionsDb.close();
});
