import { test } from "node:test";
import assert from "node:assert/strict";
import { combineDiscounts } from "./combine_discounts.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { PromotionRule } from "./evaluate_promotion.ts";

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
  appliesToPromotionalItems: true,
};

const promotionRule: PromotionRule = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "percentage",
  discountValue: 50,
  combinableWithCoupons: true,
  active: true,
};

test("combineDiscounts with no coupon and no promotion returns the untouched cart total", () => {
  const result = combineDiscounts(cart, null, null, null, NOW);
  assert.equal(result.couponApplicable, false);
  assert.equal(result.couponDiscountCents, 0);
  assert.equal(result.promotionApplicable, false);
  assert.equal(result.promotionDiscountCents, 0);
  assert.equal(result.totalDiscountCents, 0);
  assert.equal(result.totalCents, 19300);
  assert.equal(result.finalTotalCents, 19300);
});

test("combineDiscounts with only a promotion applies just the promotion discount", () => {
  const result = combineDiscounts(cart, null, promotionRule, 5500, NOW);
  assert.equal(result.promotionApplicable, true);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.couponApplicable, false);
  assert.equal(result.totalDiscountCents, 2750);
  assert.equal(result.finalTotalCents, 16550);
});

test("combineDiscounts with only a coupon applies just the coupon discount", () => {
  const result = combineDiscounts(cart, percentCoupon, null, null, NOW);
  assert.equal(result.couponApplicable, true);
  assert.equal(result.couponDiscountCents, 1930);
  assert.equal(result.promotionApplicable, false);
  assert.equal(result.totalDiscountCents, 1930);
  assert.equal(result.finalTotalCents, 17370);
});

test("combineDiscounts stacks both discounts when the coupon applies to promotional items", () => {
  const result = combineDiscounts(cart, percentCoupon, promotionRule, 5500, NOW);
  assert.equal(result.couponApplicable, true);
  assert.equal(result.couponDiscountCents, 1930);
  assert.equal(result.promotionApplicable, true);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.totalDiscountCents, 4680);
  assert.equal(result.finalTotalCents, 14620);
});

test("combineDiscounts excludes the promotional item from the coupon's eligible subtotal when the coupon opts out", () => {
  const excludingCoupon: Coupon = { ...percentCoupon, appliesToPromotionalItems: false };
  const result = combineDiscounts(cart, excludingCoupon, promotionRule, 5500, NOW);
  assert.equal(result.couponApplicable, true);
  assert.equal(result.couponDiscountCents, 1380);
  assert.equal(result.promotionApplicable, true);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.totalDiscountCents, 4130);
  assert.equal(result.finalTotalCents, 15170);
});

test("combineDiscounts ignores combinableWithCoupons: false on the promotion when the coupon applies to promotional items (coupon wins)", () => {
  const nonCombinableRule: PromotionRule = { ...promotionRule, combinableWithCoupons: false };
  const result = combineDiscounts(cart, percentCoupon, nonCombinableRule, 5500, NOW);
  assert.equal(result.couponDiscountCents, 1930);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.totalDiscountCents, 4680);
});

test("combineDiscounts does not filter the coupon's cart when the promotion is not applicable", () => {
  const inactiveRule: PromotionRule = { ...promotionRule, active: false };
  const excludingCoupon: Coupon = { ...percentCoupon, appliesToPromotionalItems: false };
  const result = combineDiscounts(cart, excludingCoupon, inactiveRule, 5500, NOW);
  assert.equal(result.promotionApplicable, false);
  assert.equal(result.couponApplicable, true);
  assert.equal(result.couponDiscountCents, 1930);
});

test("combineDiscounts propagates a null totalCents when a cart item has no price", () => {
  const cartWithFreeItem: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "50", name: "Mystery Item", quantity: 1, unitPriceCents: null }],
    updatedAt: NOW,
  };
  const result = combineDiscounts(cartWithFreeItem, percentCoupon, null, null, NOW);
  assert.equal(result.totalCents, null);
  assert.equal(result.finalTotalCents, null);
  assert.equal(result.couponApplicable, false);
});

test("combineDiscounts does not mutate the input cart", () => {
  const cartCopy: Cart = JSON.parse(JSON.stringify(cart));
  combineDiscounts(cartCopy, percentCoupon, promotionRule, 5500, NOW);
  assert.deepEqual(cartCopy, cart);
});
