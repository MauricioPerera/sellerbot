import { test } from "node:test";
import assert from "node:assert/strict";
import { findApplicablePromotions } from "./find_applicable_promotions.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Promotion } from "./promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

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

function makePromotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "promo-1",
    triggerProductId: "145",
    discountProductId: "193",
    discountType: "percentage",
    discountValue: 50,
    combinableWithCoupons: true,
    active: true,
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

test("findApplicablePromotions returns an empty list for a null cart", () => {
  const result = findApplicablePromotions(null, [makePromotion()], catalog);
  assert.deepEqual(result, []);
});

test("findApplicablePromotions returns an empty list for an empty cart", () => {
  const emptyCart: Cart = { conversationId: "conv-1", items: [], updatedAt: "2026-08-14T00:00:00.000Z" };
  const result = findApplicablePromotions(emptyCart, [makePromotion()], catalog);
  assert.deepEqual(result, []);
});

test("findApplicablePromotions returns an applicable active promotion with the resolved discount", () => {
  const promotion = makePromotion();
  const result = findApplicablePromotions(cartWithHoodie, [promotion], catalog);
  assert.equal(result.length, 1);
  assert.equal(result[0].promotion_id, promotion.id);
  assert.equal(result[0].discount_product_id, "193");
  assert.equal(result[0].discount_product_name, "Ajax Full-Zip Sweatshirt");
  assert.equal(result[0].discount_type, "percentage");
  assert.equal(result[0].discount_value, 50);
  assert.equal(result[0].discount_cents, 2750);
});

test("findApplicablePromotions excludes an inactive promotion", () => {
  const promotion = makePromotion({ active: false });
  const result = findApplicablePromotions(cartWithHoodie, [promotion], catalog);
  assert.deepEqual(result, []);
});

test("findApplicablePromotions excludes a promotion whose trigger product is not in the cart", () => {
  const otherCart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "999", name: "Other Item", quantity: 1, unitPriceCents: 1000 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = findApplicablePromotions(otherCart, [makePromotion()], catalog);
  assert.deepEqual(result, []);
});

test("findApplicablePromotions excludes a promotion whose discount product is not in the catalog", () => {
  const promotion = makePromotion({ discountProductId: "missing" });
  const result = findApplicablePromotions(cartWithHoodie, [promotion], catalog);
  assert.deepEqual(result, []);
});

test("findApplicablePromotions returns multiple applicable promotions in the given order", () => {
  const promoA = makePromotion({ id: "promo-a" });
  const promoB = makePromotion({ id: "promo-b", discountType: "fixed", discountValue: 1000 });
  const result = findApplicablePromotions(cartWithHoodie, [promoA, promoB], catalog);
  assert.equal(result.length, 2);
  assert.equal(result[0].promotion_id, "promo-a");
  assert.equal(result[1].promotion_id, "promo-b");
  assert.equal(result[1].discount_type, "fixed");
  assert.equal(result[1].discount_cents, 1000);
});

test("findApplicablePromotions returns an empty list when no promotions are given", () => {
  const result = findApplicablePromotions(cartWithHoodie, [], catalog);
  assert.deepEqual(result, []);
});

test("findApplicablePromotions never throws", () => {
  assert.doesNotThrow(() => findApplicablePromotions(null, [], []));
});
