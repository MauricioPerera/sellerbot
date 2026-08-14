import { test } from "node:test";
import assert from "node:assert/strict";
import { viewCartTool } from "./view_cart.ts";
import { openCartDb } from "../cart/cart_db.ts";
import { openPromotionsDb } from "../promotions/promotions_db.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { CreatePromotionInput } from "../promotions/promotions_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

function seededDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

function emptyPromotionsDb() {
  return openPromotionsDb(":memory:");
}

const noCoupons: Coupon[] = [];
const noCatalog: DbProduct[] = [];

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

const bigMinPurchase: Coupon = {
  code: "BIGSPENDER",
  discountType: "fixed",
  discountValue: 1000,
  minPurchaseCents: 5000000,
  validFrom: null,
  validUntil: null,
  applicableProductIds: null,
  appliesToPromotionalItems: true,
};

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

const twoItemCart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("view_cart tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, noCoupons, promotionsDb, noCatalog, "conv-1");
  assert.equal(tool.name, "view_cart");
  assert.deepEqual(tool.parameters.required ?? [], []);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() on an empty/missing cart returns an empty summary", async () => {
  const db = openCartDb(":memory:");
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, noCoupons, promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, { items: [], totalCents: 0 });
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() returns the summary with subtotals and total", async () => {
  const db = seededDb(twoItemCart);
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, noCoupons, promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].subtotalCents, 13800);
  assert.equal(result.totalCents, 19300);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() keeps separate carts per conversationId", async () => {
  const cart: Cart = {
    conversationId: "conv-a",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, noCoupons, promotionsDb, noCatalog, "conv-b");
  const result: any = await tool.execute({});
  assert.deepEqual(result, { items: [], totalCents: 0 });
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() has no discount fields when no coupon is applied", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, [welcome10], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, {
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900, subtotalCents: 6900 }],
    totalCents: 6900,
  });
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() includes discount fields when a valid coupon is applied", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  db.setCouponCode("conv-1", "WELCOME10");
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, [welcome10], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.couponCode, "WELCOME10");
  assert.equal(result.discountCents, 690);
  assert.equal(result.totalCents, 6900);
  assert.equal(result.finalTotalCents, 6210);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() omits discount fields when the applied coupon no longer evaluates as valid", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  db.setCouponCode("conv-1", "BIGSPENDER");
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, [bigMinPurchase], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, {
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900, subtotalCents: 6900 }],
    totalCents: 6900,
  });
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() omits discount fields when the applied coupon code is no longer in the coupon list", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  db.setCouponCode("conv-1", "DISCONTINUED");
  const promotionsDb = emptyPromotionsDb();
  const tool = viewCartTool(db, [welcome10], promotionsDb, noCatalog, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, {
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900, subtotalCents: 6900 }],
    totalCents: 6900,
  });
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() includes promotion fields when a valid promotion is applied", async () => {
  const db = seededDb(twoItemCart);
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  db.setPromotionId("conv-1", promotion.id);
  const tool = viewCartTool(db, noCoupons, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.promotionId, promotion.id);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.totalCents, 19300);
  assert.equal(result.finalTotalCents, 16550);
  assert.equal(result.couponCode, undefined);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() omits promotion fields when the applied promotion is no longer active", async () => {
  const db = seededDb(twoItemCart);
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  promotionsDb.setActive(promotion.id, false);
  db.setPromotionId("conv-1", promotion.id);
  const tool = viewCartTool(db, noCoupons, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.promotionId, undefined);
  assert.equal(result.finalTotalCents, undefined);
  assert.equal(result.totalCents, 19300);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() omits promotion fields when the applied promotion id no longer exists", async () => {
  const db = seededDb(twoItemCart);
  const promotionsDb = emptyPromotionsDb();
  db.setPromotionId("conv-1", "missing");
  const tool = viewCartTool(db, noCoupons, promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.promotionId, undefined);
  assert.equal(result.totalCents, 19300);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() stacks coupon and promotion discounts when the coupon applies to promotional items", async () => {
  const db = seededDb(twoItemCart);
  db.setCouponCode("conv-1", "WELCOME10");
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  db.setPromotionId("conv-1", promotion.id);
  const tool = viewCartTool(db, [welcome10], promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.discountCents, 1930);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.finalTotalCents, 14620);
  db.close();
  promotionsDb.close();
});

test("view_cart tool execute() excludes the promotional item from the coupon's subtotal when the coupon opts out", async () => {
  const excludingCoupon: Coupon = { ...welcome10, appliesToPromotionalItems: false };
  const db = seededDb(twoItemCart);
  db.setCouponCode("conv-1", "WELCOME10");
  const promotionsDb = emptyPromotionsDb();
  const promotion = promotionsDb.createPromotion(promotionRule);
  db.setPromotionId("conv-1", promotion.id);
  const tool = viewCartTool(db, [excludingCoupon], promotionsDb, catalog, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.discountCents, 1380);
  assert.equal(result.promotionDiscountCents, 2750);
  assert.equal(result.finalTotalCents, 15170);
  db.close();
  promotionsDb.close();
});
