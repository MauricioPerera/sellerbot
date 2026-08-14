import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmPurchaseTool } from "./confirm_purchase.ts";
import { openCartDb } from "../cart/cart_db.ts";
import { openOrdersDb } from "../orders/orders_db.ts";
import { openPromotionsDb } from "../promotions/promotions_db.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { CreatePromotionInput } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

const welcome10: Coupon = {
  code: "WELCOME10",
  discountType: "percentage",
  discountValue: 10,
  minPurchaseCents: null,
  validFrom: null,
  validUntil: null,
  applicableProductIds: null,
  appliesToPromotionalItems: true,
};

function seededCartDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

function emptyPromotionsDb() {
  return openPromotionsDb(":memory:");
}

const noCatalog: DbProduct[] = [];

const catalog: DbProduct[] = [
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

const promotionRule: CreatePromotionInput = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "percentage",
  discountValue: 50,
  combinableWithCoupons: true,
};

const filledCart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("confirm_purchase tool declares its OpenAI-facing shape", () => {
  const cartDb = openCartDb(":memory:");
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, noCatalog, "conv-1");
  assert.equal(tool.name, "confirm_purchase");
  assert.deepEqual(tool.parameters.required ?? [], []);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() creates an order from the cart and returns a pay link", async () => {
  const cartDb = seededCartDb(filledCart);
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});

  assert.equal(result.error, undefined);
  assert.equal(typeof result.order_id, "string");
  assert.equal(result.total_cents, 19300);
  assert.equal(typeof result.pay_url, "string");
  assert.match(result.pay_url, /^\/pay\/.+/);

  const order = ordersDb.getOrder(result.order_id);
  assert.equal(order?.status, "pending_payment");
  assert.equal(order?.conversationId, "conv-1");
  assert.equal(order?.items.length, 2);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() clears the cart after creating the order", async () => {
  const cartDb = seededCartDb(filledCart);
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, noCatalog, "conv-1");
  await tool.execute({});

  const cartAfter = cartDb.getCart("conv-1");
  assert.deepEqual(cartAfter?.items, []);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() returns a structured error for an empty cart", async () => {
  const cartDb = openCartDb(":memory:");
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.error, "cart is empty");
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() returns a structured error when an item has no price", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "50", name: "Mystery Item", quantity: 1, unitPriceCents: null }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const cartDb = seededCartDb(cart);
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.error, "cart has an item with no price, cannot confirm purchase");
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() keeps orders separate per conversationId", async () => {
  const cartDbA = seededCartDb({ ...filledCart, conversationId: "conv-a" });
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const toolA = confirmPurchaseTool(cartDbA, ordersDb, [], promotionsDb, noCatalog, "conv-a");
  const resultA: any = await toolA.execute({});
  const order = ordersDb.getOrder(resultA.order_id);
  assert.equal(order?.conversationId, "conv-a");
  cartDbA.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() applies a valid coupon's discount to the order total", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "WELCOME10");
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [welcome10], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});

  assert.equal(result.error, undefined);
  assert.equal(result.total_cents, 17370);
  assert.equal(result.discount_cents, 1930);
  assert.equal(result.coupon_code, "WELCOME10");

  const order = ordersDb.getOrder(result.order_id);
  assert.equal(order?.totalCents, 17370);
  assert.equal(order?.discountCents, 1930);
  assert.equal(order?.couponCode, "WELCOME10");
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() clears the applied coupon after a successful confirm", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "WELCOME10");
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [welcome10], promotionsDb, noCatalog, "conv-1");
  await tool.execute({});

  assert.equal(cartDb.getCouponCode("conv-1"), null);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() silently ignores a coupon code that no longer resolves to a valid coupon", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "EXPIRED");
  const ordersDb = openOrdersDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});

  assert.equal(result.error, undefined);
  assert.equal(result.total_cents, 19300);
  assert.equal(result.discount_cents, undefined);
  assert.equal(result.coupon_code, undefined);

  const order = ordersDb.getOrder(result.order_id);
  assert.equal(order?.totalCents, 19300);
  assert.equal(order?.discountCents, 0);
  assert.equal(order?.couponCode, null);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() applies a valid promotion's discount to the order total", async () => {
  const cartDb = seededCartDb(filledCart);
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  cartDb.setPromotionId("conv-1", promotion.id);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});

  assert.equal(result.error, undefined);
  assert.equal(result.total_cents, 16550);
  assert.equal(result.promotion_discount_cents, 2750);
  assert.equal(result.promotion_id, promotion.id);

  const order = ordersDb.getOrder(result.order_id);
  assert.equal(order?.totalCents, 16550);
  assert.equal(order?.promotionDiscountCents, 2750);
  assert.equal(order?.promotionId, promotion.id);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() clears the applied promotion after a successful confirm", async () => {
  const cartDb = seededCartDb(filledCart);
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  cartDb.setPromotionId("conv-1", promotion.id);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, catalog, "conv-1");
  await tool.execute({});

  assert.equal(cartDb.getPromotionId("conv-1"), null);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() silently ignores a promotion that is no longer active", async () => {
  const cartDb = seededCartDb(filledCart);
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  promotionsDb.setActive(promotion.id, false);
  cartDb.setPromotionId("conv-1", promotion.id);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});

  assert.equal(result.error, undefined);
  assert.equal(result.total_cents, 19300);
  assert.equal(result.promotion_discount_cents, undefined);
  assert.equal(result.promotion_id, undefined);

  const order = ordersDb.getOrder(result.order_id);
  assert.equal(order?.totalCents, 19300);
  assert.equal(order?.promotionDiscountCents, 0);
  assert.equal(order?.promotionId, null);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});

test("confirm_purchase tool execute() combines coupon and promotion discounts when the coupon applies to promotional items", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "WELCOME10");
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  cartDb.setPromotionId("conv-1", promotion.id);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [welcome10], promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});

  assert.equal(result.total_cents, 14620);
  assert.equal(result.discount_cents, 1930);
  assert.equal(result.promotion_discount_cents, 2750);

  const order = ordersDb.getOrder(result.order_id);
  assert.equal(order?.totalCents, 14620);
  assert.equal(order?.discountCents, 1930);
  assert.equal(order?.promotionDiscountCents, 2750);
  cartDb.close();
  ordersDb.close();
  promotionsDb.close();
});
