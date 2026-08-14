import { test } from "node:test";
import assert from "node:assert/strict";
import { viewCartTool } from "./view_cart.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";

function seededDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

const noCoupons: Coupon[] = [];

const welcome10: Coupon = {
  code: "WELCOME10",
  discountType: "percentage",
  discountValue: 10,
  minPurchaseCents: null,
  validFrom: null,
  validUntil: null,
  applicableProductIds: null,
};

const bigMinPurchase: Coupon = {
  code: "BIGSPENDER",
  discountType: "fixed",
  discountValue: 1000,
  minPurchaseCents: 5000000,
  validFrom: null,
  validUntil: null,
  applicableProductIds: null,
};

test("view_cart tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = viewCartTool(db, noCoupons, "conv-1");
  assert.equal(tool.name, "view_cart");
  assert.deepEqual(tool.parameters.required ?? [], []);
  db.close();
});

test("view_cart tool execute() on an empty/missing cart returns an empty summary", async () => {
  const db = openCartDb(":memory:");
  const tool = viewCartTool(db, noCoupons, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, { items: [], totalCents: 0 });
  db.close();
});

test("view_cart tool execute() returns the summary with subtotals and total", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [
      { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
      { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
    ],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const tool = viewCartTool(db, noCoupons, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].subtotalCents, 13800);
  assert.equal(result.totalCents, 19300);
  db.close();
});

test("view_cart tool execute() keeps separate carts per conversationId", async () => {
  const cart: Cart = {
    conversationId: "conv-a",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const tool = viewCartTool(db, noCoupons, "conv-b");
  const result: any = await tool.execute({});
  assert.deepEqual(result, { items: [], totalCents: 0 });
  db.close();
});

test("view_cart tool execute() has no discount fields when no coupon is applied", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const tool = viewCartTool(db, [welcome10], "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, {
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900, subtotalCents: 6900 }],
    totalCents: 6900,
  });
  db.close();
});

test("view_cart tool execute() includes discount fields when a valid coupon is applied", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  db.setCouponCode("conv-1", "WELCOME10");
  const tool = viewCartTool(db, [welcome10], "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.couponCode, "WELCOME10");
  assert.equal(result.discountCents, 690);
  assert.equal(result.totalCents, 6900);
  assert.equal(result.finalTotalCents, 6210);
  db.close();
});

test("view_cart tool execute() omits discount fields when the applied coupon no longer evaluates as valid", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  db.setCouponCode("conv-1", "BIGSPENDER");
  const tool = viewCartTool(db, [bigMinPurchase], "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, {
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900, subtotalCents: 6900 }],
    totalCents: 6900,
  });
  db.close();
});

test("view_cart tool execute() omits discount fields when the applied coupon code is no longer in the coupon list", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  db.setCouponCode("conv-1", "DISCONTINUED");
  const tool = viewCartTool(db, [welcome10], "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, {
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900, subtotalCents: 6900 }],
    totalCents: 6900,
  });
  db.close();
});
