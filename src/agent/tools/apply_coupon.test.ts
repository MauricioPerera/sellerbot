import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCouponTool } from "./apply_coupon.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";

function seededDb(cart: Cart) {
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

const coupons: Coupon[] = [
  {
    code: "WELCOME10",
    discountType: "percentage",
    discountValue: 10,
    minPurchaseCents: null,
    validFrom: null,
    validUntil: null,
    applicableProductIds: null,
  },
  {
    code: "EXPIRED",
    discountType: "percentage",
    discountValue: 50,
    minPurchaseCents: null,
    validFrom: null,
    validUntil: "2020-01-01T00:00:00.000Z",
    applicableProductIds: null,
  },
];

test("apply_coupon tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = applyCouponTool(db, coupons, "conv-1");
  assert.equal(tool.name, "apply_coupon");
  assert.equal(tool.parameters.required?.includes("code"), true);
  db.close();
});

test("apply_coupon tool execute() applies a valid coupon and persists the code", async () => {
  const db = seededDb(filledCart);
  const tool = applyCouponTool(db, coupons, "conv-1");
  const result: any = await tool.execute({ code: "WELCOME10" });
  assert.equal(result.error, undefined);
  assert.equal(result.code, "WELCOME10");
  assert.equal(result.discount_cents, 1930);
  assert.equal(result.subtotal_cents, 19300);
  assert.equal(result.total_cents, 17370);
  assert.equal(db.getCouponCode("conv-1"), "WELCOME10");
  db.close();
});

test("apply_coupon tool execute() is case-insensitive on the code", async () => {
  const db = seededDb(filledCart);
  const tool = applyCouponTool(db, coupons, "conv-1");
  const result: any = await tool.execute({ code: "welcome10" });
  assert.equal(result.code, "WELCOME10");
  db.close();
});

test("apply_coupon tool execute() returns a structured error for an unknown code without persisting it", async () => {
  const db = seededDb(filledCart);
  const tool = applyCouponTool(db, coupons, "conv-1");
  const result: any = await tool.execute({ code: "NOPE" });
  assert.equal(result.error, "coupon not found");
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("apply_coupon tool execute() returns a structured error for an ineligible coupon without persisting it", async () => {
  const db = seededDb(filledCart);
  const tool = applyCouponTool(db, coupons, "conv-1");
  const result: any = await tool.execute({ code: "EXPIRED" });
  assert.equal(typeof result.error, "string");
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("apply_coupon tool execute() returns a structured error for an empty cart", async () => {
  const db = openCartDb(":memory:");
  const tool = applyCouponTool(db, coupons, "conv-1");
  const result: any = await tool.execute({ code: "WELCOME10" });
  assert.equal(result.error, "cart is empty");
  db.close();
});

test("apply_coupon tool execute() rejects a non-string code", async () => {
  const db = seededDb(filledCart);
  const tool = applyCouponTool(db, coupons, "conv-1");
  const result: any = await tool.execute({ code: 10 });
  assert.equal(result.error, "code must be a string");
  db.close();
});

test("apply_coupon tool execute() replacing a previously applied coupon overwrites it", async () => {
  const db = seededDb(filledCart);
  const tool = applyCouponTool(db, coupons, "conv-1");
  await tool.execute({ code: "WELCOME10" });
  const result: any = await tool.execute({ code: "NOPE" });
  assert.equal(result.error, "coupon not found");
  assert.equal(db.getCouponCode("conv-1"), "WELCOME10");
  db.close();
});
