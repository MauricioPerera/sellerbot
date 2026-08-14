import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePromotion } from "./evaluate_promotion.ts";
import type { PromotionRule } from "./evaluate_promotion.ts";
import type { Cart } from "../cart/cart_db.ts";

const cartWithTrigger: Cart = {
  conversationId: "conv-1",
  items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const cartWithoutTrigger: Cart = {
  conversationId: "conv-1",
  items: [{ productId: "999", name: "Other Item", quantity: 1, unitPriceCents: 1000 }],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const emptyCart: Cart = {
  conversationId: "conv-1",
  items: [],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const percentageRule: PromotionRule = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "percentage",
  discountValue: 50,
  combinableWithCoupons: true,
  active: true,
};

const fixedRule: PromotionRule = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "fixed",
  discountValue: 99999,
  combinableWithCoupons: false,
  active: true,
};

const inactiveRule: PromotionRule = {
  ...percentageRule,
  active: false,
};

test("evaluatePromotion returns not applicable when rule is null", () => {
  const result = evaluatePromotion(cartWithTrigger, null, 5500);
  assert.equal(result.applicable, false);
  assert.equal(result.reason, "promotion not found");
  assert.equal(result.discountCents, null);
});

test("evaluatePromotion returns not applicable when the rule is inactive", () => {
  const result = evaluatePromotion(cartWithTrigger, inactiveRule, 5500);
  assert.equal(result.applicable, false);
  assert.equal(result.reason, "promotion not active");
  assert.equal(result.discountCents, null);
});

test("evaluatePromotion returns not applicable when the trigger product is not in the cart", () => {
  const result = evaluatePromotion(cartWithoutTrigger, percentageRule, 5500);
  assert.equal(result.applicable, false);
  assert.equal(result.reason, "trigger product not in cart");
  assert.equal(result.discountCents, null);
});

test("evaluatePromotion returns not applicable for an empty cart", () => {
  const result = evaluatePromotion(emptyCart, percentageRule, 5500);
  assert.equal(result.applicable, false);
  assert.equal(result.reason, "trigger product not in cart");
  assert.equal(result.discountCents, null);
});

test("evaluatePromotion returns not applicable when the discount product's price is unknown", () => {
  const result = evaluatePromotion(cartWithTrigger, percentageRule, null);
  assert.equal(result.applicable, false);
  assert.equal(result.reason, "discount product price unknown");
  assert.equal(result.discountCents, null);
});

test("evaluatePromotion computes a percentage discount when the trigger product is present", () => {
  const result = evaluatePromotion(cartWithTrigger, percentageRule, 5500);
  assert.equal(result.applicable, true);
  assert.equal(result.reason, null);
  assert.equal(result.discountCents, 2750);
});

test("evaluatePromotion computes a fixed discount capped at the discount product's unit price", () => {
  const result = evaluatePromotion(cartWithTrigger, fixedRule, 5500);
  assert.equal(result.applicable, true);
  assert.equal(result.reason, null);
  assert.equal(result.discountCents, 5500);
});

test("evaluatePromotion computes an uncapped fixed discount when it is below the unit price", () => {
  const smallFixedRule: PromotionRule = { ...fixedRule, discountValue: 1000 };
  const result = evaluatePromotion(cartWithTrigger, smallFixedRule, 5500);
  assert.equal(result.applicable, true);
  assert.equal(result.discountCents, 1000);
});

test("evaluatePromotion does not mutate the cart", () => {
  const cartCopy: Cart = JSON.parse(JSON.stringify(cartWithTrigger));
  evaluatePromotion(cartCopy, percentageRule, 5500);
  assert.deepEqual(cartCopy, cartWithTrigger);
});

test("evaluatePromotion never throws for any combination of inputs", () => {
  assert.doesNotThrow(() => evaluatePromotion(emptyCart, null, null));
  assert.doesNotThrow(() => evaluatePromotion(cartWithTrigger, inactiveRule, null));
});
