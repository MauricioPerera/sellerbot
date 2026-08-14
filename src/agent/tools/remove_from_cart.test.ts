import { test } from "node:test";
import assert from "node:assert/strict";
import { removeFromCartTool } from "./remove_from_cart.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";

function seededDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

const sampleCart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("remove_from_cart tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = removeFromCartTool(db, "conv-1");
  assert.equal(tool.name, "remove_from_cart");
  assert.equal(tool.parameters.required?.includes("product_id"), true);
  db.close();
});

test("remove_from_cart tool execute() removes the item and persists it", async () => {
  const db = seededDb(sampleCart);
  const tool = removeFromCartTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "145" });
  assert.equal(result.cart.items.length, 1);
  assert.equal(result.cart.items[0].productId, "193");

  const persisted = db.getCart("conv-1");
  assert.equal(persisted?.items.length, 1);
  db.close();
});

test("remove_from_cart tool execute() on an empty/missing cart returns an empty cart", async () => {
  const db = openCartDb(":memory:");
  const tool = removeFromCartTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "145" });
  assert.deepEqual(result.cart.items, []);
  db.close();
});

test("remove_from_cart tool execute() is a no-op for a productId not in the cart", async () => {
  const db = seededDb(sampleCart);
  const tool = removeFromCartTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: "999" });
  assert.equal(result.cart.items.length, 2);
  db.close();
});

test("remove_from_cart tool execute() rejects a non-string product_id", async () => {
  const db = seededDb(sampleCart);
  const tool = removeFromCartTool(db, "conv-1");
  const result: any = await tool.execute({ product_id: 145 });
  assert.equal(result.error, "product_id must be a string");
  db.close();
});
