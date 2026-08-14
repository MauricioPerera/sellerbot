import { test } from "node:test";
import assert from "node:assert/strict";
import { updateCartQuantityTool } from "./update_cart_quantity.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";

function seededDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

const sampleCart: Cart = {
  conversationId: "conv-1",
  items: [{ productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 }],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("update_cart_quantity tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = updateCartQuantityTool(db, "conv-1");
  assert.equal(tool.name, "update_cart_quantity");
  assert.equal(tool.parameters.required?.includes("product_id"), true);
  assert.equal(tool.parameters.required?.includes("quantity"), true);
  db.close();
});

test("update_cart_quantity tool execute() sets the quantity and persists it", async () => {
  const db = seededDb(sampleCart);
  const tool = updateCartQuantityTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "145", quantity: 5 });
  assert.equal(result.cart.items[0].quantity, 5);

  const persisted = db.getCart("conv-1");
  assert.equal(persisted?.items[0].quantity, 5);
  db.close();
});

test("update_cart_quantity tool execute() removes the item when quantity is 0", async () => {
  const db = seededDb(sampleCart);
  const tool = updateCartQuantityTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "145", quantity: 0 });
  assert.deepEqual(result.cart.items, []);
  db.close();
});

test("update_cart_quantity tool execute() returns a structured error for a productId not in the cart", async () => {
  const db = seededDb(sampleCart);
  const tool = updateCartQuantityTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "999", quantity: 1 });
  assert.equal(result.error, "product_id not in cart: 999");
  db.close();
});

test("update_cart_quantity tool execute() rejects a negative quantity", async () => {
  const db = seededDb(sampleCart);
  const tool = updateCartQuantityTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "145", quantity: -1 });
  assert.equal(result.error, "quantity must be a non-negative integer");
  db.close();
});

test("update_cart_quantity tool execute() rejects a non-string product_id", async () => {
  const db = seededDb(sampleCart);
  const tool = updateCartQuantityTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: 145, quantity: 1 });
  assert.equal(result.error, "product_id must be a string");
  db.close();
});
