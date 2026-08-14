import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPromotionTool } from "./apply_promotion.ts";
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

test("apply_promotion tool declares its OpenAI-facing shape", () => {
  const cartDb = openCartDb(":memory:");
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  assert.equal(tool.name, "apply_promotion");
  assert.equal(tool.parameters.required?.includes("promotion_id"), true);
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() adds the discounted product and marks the promotion active", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(rule);
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({ promotion_id: promotion.id });

  assert.equal(result.error, undefined);
  assert.equal(result.discount_cents, 2750);
  assert.equal(result.item.productId, "193");
  assert.equal(result.item.quantity, 1);
  assert.equal(result.item.unitPriceCents, 5500);

  const cart = cartDb.getCart("conv-1");
  assert.equal(cart?.items.length, 2);
  assert.equal(cartDb.getPromotionId("conv-1"), promotion.id);
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() merges quantity when the discounted product is already in the cart", async () => {
  const cartDb = seededCartDb({
    ...cartWithHoodie,
    items: [...cartWithHoodie.items, { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 }],
  });
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(rule);
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  await tool.execute({ promotion_id: promotion.id });

  const cart = cartDb.getCart("conv-1");
  const item = cart?.items.find((i) => i.productId === "193");
  assert.equal(item?.quantity, 2);
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() returns a structured error for an unknown promotion id", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({ promotion_id: "missing" });
  assert.equal(result.error, "promotion not found");
  assert.equal(cartDb.getPromotionId("conv-1"), null);
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() returns a structured error for an inactive promotion", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(rule);
  promotionsDb.setActive(promotion.id, false);
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({ promotion_id: promotion.id });
  assert.equal(result.error, "promotion not active");
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() returns a structured error when the trigger product is not in the cart", async () => {
  const cartDb = openCartDb(":memory:");
  cartDb.saveCart({
    conversationId: "conv-1",
    items: [{ productId: "999", name: "Other Item", quantity: 1, unitPriceCents: 1000 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  });
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion(rule);
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({ promotion_id: promotion.id });
  assert.equal(result.error, "trigger product not in cart");
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() returns a structured error when the discount product is not in the catalog", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const promotion = promotionsDb.createPromotion({ ...rule, discountProductId: "missing" });
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({ promotion_id: promotion.id });
  assert.equal(result.error, "discount product price unknown");
  cartDb.close();
  promotionsDb.close();
});

test("apply_promotion tool execute() rejects a non-string promotion_id", async () => {
  const cartDb = seededCartDb(cartWithHoodie);
  const promotionsDb = openPromotionsDb(":memory:");
  const tool = applyPromotionTool(cartDb, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({ promotion_id: 10 });
  assert.equal(result.error, "promotion_id must be a string");
  cartDb.close();
  promotionsDb.close();
});
