import { test } from "node:test";
import assert from "node:assert/strict";
import { removeCartItem } from "./cart_remove_item.ts";
import type { Cart } from "./cart_db.ts";

const cart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("removeCartItem removes the matching item", () => {
  const result = removeCartItem(cart, "145");
  assert.deepEqual(result.items, [{ productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 }]);
});

test("removeCartItem does not mutate the input cart", () => {
  removeCartItem(cart, "145");
  assert.equal(cart.items.length, 2);
});

test("removeCartItem preserves the cart's conversationId and updatedAt", () => {
  const result = removeCartItem(cart, "145");
  assert.equal(result.conversationId, "conv-1");
  assert.equal(result.updatedAt, "2026-08-14T00:00:00.000Z");
});

test("removeCartItem is a no-op when the productId is not in the cart", () => {
  const result = removeCartItem(cart, "999");
  assert.deepEqual(result.items, cart.items);
});

test("removeCartItem on an empty cart returns an empty cart", () => {
  const emptyCart: Cart = { conversationId: "conv-1", items: [], updatedAt: "2026-08-14T00:00:00.000Z" };
  const result = removeCartItem(emptyCart, "145");
  assert.deepEqual(result.items, []);
});

test("removeCartItem removing every item leaves an empty items array", () => {
  const oneItemCart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = removeCartItem(oneItemCart, "145");
  assert.deepEqual(result.items, []);
});
