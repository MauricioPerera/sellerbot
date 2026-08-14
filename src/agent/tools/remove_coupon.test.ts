import { test } from "node:test";
import assert from "node:assert/strict";
import { removeCouponTool } from "./remove_coupon.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";

function seededDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

const filledCart: Cart = {
  conversationId: "conv-1",
  items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("remove_coupon tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = removeCouponTool(db, "conv-1");
  assert.equal(tool.name, "remove_coupon");
  assert.deepEqual(tool.parameters.required ?? [], []);
  db.close();
});

test("remove_coupon tool execute() clears a previously applied coupon", async () => {
  const db = seededDb(filledCart);
  db.setCouponCode("conv-1", "WELCOME10");
  const tool = removeCouponTool(db, "conv-1");
  await tool.execute({});
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("remove_coupon tool execute() returns the cart total without a discount", async () => {
  const db = seededDb(filledCart);
  db.setCouponCode("conv-1", "WELCOME10");
  const tool = removeCouponTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.total_cents, 6900);
  db.close();
});

test("remove_coupon tool execute() is a no-op when there is no cart", async () => {
  const db = openCartDb(":memory:");
  const tool = removeCouponTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.total_cents, 0);
  db.close();
});

test("remove_coupon tool execute() is a no-op when no coupon was applied", async () => {
  const db = seededDb(filledCart);
  const tool = removeCouponTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.total_cents, 6900);
  db.close();
});
