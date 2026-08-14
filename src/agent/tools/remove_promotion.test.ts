import { test } from "node:test";
import assert from "node:assert/strict";
import { removePromotionTool } from "./remove_promotion.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";

const filledCart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("remove_promotion tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = removePromotionTool(db, "conv-1");
  assert.equal(tool.name, "remove_promotion");
  assert.deepEqual(tool.parameters.required ?? [], []);
  db.close();
});

test("remove_promotion tool execute() clears a previously applied promotion", async () => {
  const db = openCartDb(":memory:");
  db.saveCart(filledCart);
  db.setPromotionId("conv-1", "promo-1");
  const tool = removePromotionTool(db, "conv-1");
  await tool.execute({});
  assert.equal(db.getPromotionId("conv-1"), null);
  db.close();
});

test("remove_promotion tool execute() does not remove any cart items", async () => {
  const db = openCartDb(":memory:");
  db.saveCart(filledCart);
  db.setPromotionId("conv-1", "promo-1");
  const tool = removePromotionTool(db, "conv-1");
  await tool.execute({});
  assert.equal(db.getCart("conv-1")?.items.length, 2);
  db.close();
});

test("remove_promotion tool execute() does not touch an applied coupon code", async () => {
  const db = openCartDb(":memory:");
  db.saveCart(filledCart);
  db.setCouponCode("conv-1", "WELCOME10");
  db.setPromotionId("conv-1", "promo-1");
  const tool = removePromotionTool(db, "conv-1");
  await tool.execute({});
  assert.equal(db.getCouponCode("conv-1"), "WELCOME10");
  db.close();
});

test("remove_promotion tool execute() is idempotent with no cart and no promotion applied", async () => {
  const db = openCartDb(":memory:");
  const tool = removePromotionTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.error, undefined);
  assert.equal(db.getPromotionId("conv-1"), null);
  db.close();
});

test("remove_promotion tool execute() returns the cart summary", async () => {
  const db = openCartDb(":memory:");
  db.saveCart(filledCart);
  db.setPromotionId("conv-1", "promo-1");
  const tool = removePromotionTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.items.length, 2);
  assert.equal(result.total_cents, 19300);
  db.close();
});

test("remove_promotion tool execute() with no cart returns an empty summary", async () => {
  const db = openCartDb(":memory:");
  const tool = removePromotionTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result.items, []);
  assert.equal(result.total_cents, 0);
  db.close();
});
