import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCoupon } from "./evaluate_coupon.ts";
import type { Coupon } from "./evaluate_coupon.ts";
import type { Cart } from "../cart/cart_db.ts";

const NOW = "2026-08-14T12:00:00.000Z";

const cart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: NOW,
};
// cart subtotal: 6900*2 + 5500 = 19300

const percentCoupon: Coupon = {
  code: "WELCOME10",
  discountType: "percentage",
  discountValue: 10,
  minPurchaseCents: null,
  validFrom: null,
  validUntil: null,
  applicableProductIds: null,
};

test("evaluateCoupon returns invalid with a null coupon (code not found)", () => {
  const result = evaluateCoupon(cart, null, NOW);
  assert.equal(result.valid, false);
  assert.equal(result.discountCents, null);
  assert.match(result.reason ?? "", /not found/i);
});

test("evaluateCoupon returns invalid for an empty cart", () => {
  const emptyCart: Cart = { conversationId: "conv-1", items: [], updatedAt: NOW };
  const result = evaluateCoupon(emptyCart, percentCoupon, NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /empty/i);
});

test("evaluateCoupon applies a percentage discount to the whole cart subtotal", () => {
  const result = evaluateCoupon(cart, percentCoupon, NOW);
  assert.equal(result.valid, true);
  assert.equal(result.discountCents, 1930);
  assert.equal(result.reason, null);
});

test("evaluateCoupon applies a fixed discount, capped at the eligible subtotal", () => {
  const bigFixed: Coupon = { ...percentCoupon, discountType: "fixed", discountValue: 50000 };
  const result = evaluateCoupon(cart, bigFixed, NOW);
  assert.equal(result.valid, true);
  assert.equal(result.discountCents, 19300);
});

test("evaluateCoupon applies a fixed discount smaller than the subtotal without capping", () => {
  const smallFixed: Coupon = { ...percentCoupon, discountType: "fixed", discountValue: 1000 };
  const result = evaluateCoupon(cart, smallFixed, NOW);
  assert.equal(result.valid, true);
  assert.equal(result.discountCents, 1000);
});

test("evaluateCoupon returns invalid when the coupon has not started yet", () => {
  const futureCoupon: Coupon = { ...percentCoupon, validFrom: "2026-09-01T00:00:00.000Z" };
  const result = evaluateCoupon(cart, futureCoupon, NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /not.*valid|vigen/i);
});

test("evaluateCoupon returns invalid when the coupon already expired", () => {
  const expiredCoupon: Coupon = { ...percentCoupon, validUntil: "2026-01-01T00:00:00.000Z" };
  const result = evaluateCoupon(cart, expiredCoupon, NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /expir|venc/i);
});

test("evaluateCoupon accepts a coupon within its valid date range", () => {
  const inRangeCoupon: Coupon = {
    ...percentCoupon,
    validFrom: "2026-08-01T00:00:00.000Z",
    validUntil: "2026-08-31T00:00:00.000Z",
  };
  const result = evaluateCoupon(cart, inRangeCoupon, NOW);
  assert.equal(result.valid, true);
});

test("evaluateCoupon returns invalid when the cart subtotal is below the minimum purchase", () => {
  const minPurchaseCoupon: Coupon = { ...percentCoupon, minPurchaseCents: 50000 };
  const result = evaluateCoupon(cart, minPurchaseCoupon, NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /minim/i);
});

test("evaluateCoupon accepts a coupon when the cart meets the minimum purchase", () => {
  const minPurchaseCoupon: Coupon = { ...percentCoupon, minPurchaseCents: 19300 };
  const result = evaluateCoupon(cart, minPurchaseCoupon, NOW);
  assert.equal(result.valid, true);
});

test("evaluateCoupon returns invalid when no cart item matches the applicable product list", () => {
  const restrictedCoupon: Coupon = { ...percentCoupon, applicableProductIds: ["999"] };
  const result = evaluateCoupon(cart, restrictedCoupon, NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /eligible|aplicab/i);
});

test("evaluateCoupon computes the discount only on the eligible items when product-restricted", () => {
  const restrictedCoupon: Coupon = { ...percentCoupon, applicableProductIds: ["145"] };
  const result = evaluateCoupon(cart, restrictedCoupon, NOW);
  assert.equal(result.valid, true);
  assert.equal(result.discountCents, 1380);
});

test("evaluateCoupon returns invalid when a cart item has no price", () => {
  const cartWithFreeItem: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "50", name: "Mystery Item", quantity: 1, unitPriceCents: null }],
    updatedAt: NOW,
  };
  const result = evaluateCoupon(cartWithFreeItem, percentCoupon, NOW);
  assert.equal(result.valid, false);
  assert.match(result.reason ?? "", /price|precio/i);
});

test("evaluateCoupon does not mutate the input cart", () => {
  evaluateCoupon(cart, percentCoupon, NOW);
  assert.equal(cart.items.length, 2);
});
