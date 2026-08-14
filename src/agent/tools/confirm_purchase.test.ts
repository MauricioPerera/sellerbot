import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmPurchaseTool } from "./confirm_purchase.ts";
import { openCartDb } from "../cart/cart_db.ts";
import { openOrdersDb } from "../orders/orders_db.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";

const welcome10: Coupon = {
  code: "WELCOME10",
  discountType: "percentage",
  discountValue: 10,
  minPurchaseCents: null,
  validFrom: null,
  validUntil: null,
  applicableProductIds: null,
};

function seededCartDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

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
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], "conv-1");
  assert.equal(tool.name, "confirm_purchase");
  assert.deepEqual(tool.parameters.required ?? [], []);
  cartDb.close();
  ordersDb.close();
});

test("confirm_purchase tool execute() creates an order from the cart and returns a pay link", async () => {
  const cartDb = seededCartDb(filledCart);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], "conv-1");
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
});

test("confirm_purchase tool execute() clears the cart after creating the order", async () => {
  const cartDb = seededCartDb(filledCart);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], "conv-1");
  await tool.execute({});

  const cartAfter = cartDb.getCart("conv-1");
  assert.deepEqual(cartAfter?.items, []);
  cartDb.close();
  ordersDb.close();
});

test("confirm_purchase tool execute() returns a structured error for an empty cart", async () => {
  const cartDb = openCartDb(":memory:");
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.error, "cart is empty");
  cartDb.close();
  ordersDb.close();
});

test("confirm_purchase tool execute() returns a structured error when an item has no price", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "50", name: "Mystery Item", quantity: 1, unitPriceCents: null }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const cartDb = seededCartDb(cart);
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.error, "cart has an item with no price, cannot confirm purchase");
  cartDb.close();
  ordersDb.close();
});

test("confirm_purchase tool execute() keeps orders separate per conversationId", async () => {
  const cartDbA = seededCartDb({ ...filledCart, conversationId: "conv-a" });
  const ordersDb = openOrdersDb(":memory:");
  const toolA = confirmPurchaseTool(cartDbA, ordersDb, [], "conv-a");
  const resultA: any = await toolA.execute({});
  const order = ordersDb.getOrder(resultA.order_id);
  assert.equal(order?.conversationId, "conv-a");
  cartDbA.close();
  ordersDb.close();
});

test("confirm_purchase tool execute() applies a valid coupon's discount to the order total", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "WELCOME10");
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [welcome10], "conv-1");
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
});

test("confirm_purchase tool execute() clears the applied coupon after a successful confirm", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "WELCOME10");
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [welcome10], "conv-1");
  await tool.execute({});

  assert.equal(cartDb.getCouponCode("conv-1"), null);
  cartDb.close();
  ordersDb.close();
});

test("confirm_purchase tool execute() silently ignores a coupon code that no longer resolves to a valid coupon", async () => {
  const cartDb = seededCartDb(filledCart);
  cartDb.setCouponCode("conv-1", "EXPIRED");
  const ordersDb = openOrdersDb(":memory:");
  const tool = confirmPurchaseTool(cartDb, ordersDb, [], "conv-1");
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
});
