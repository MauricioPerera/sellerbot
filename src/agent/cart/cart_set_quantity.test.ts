import { test } from "node:test";
import assert from "node:assert/strict";
import { setCartItemQuantity } from "./cart_set_quantity.ts";
import type { Cart } from "./cart_db.ts";

const cart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("setCartItemQuantity sets the quantity of the matching item", () => {
  const result = setCartItemQuantity(cart, "145", 5);
  assert.deepEqual(result.items, [
    { productId: "145", name: "Abominable Hoodie", quantity: 5, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ]);
});

test("setCartItemQuantity does not mutate the input cart", () => {
  setCartItemQuantity(cart, "145", 5);
  assert.equal(cart.items[0].quantity, 2);
});

test("setCartItemQuantity preserves the cart's conversationId and updatedAt", () => {
  const result = setCartItemQuantity(cart, "145", 5);
  assert.equal(result.conversationId, "conv-1");
  assert.equal(result.updatedAt, "2026-08-14T00:00:00.000Z");
});

test("setCartItemQuantity removes the item entirely when quantity is 0", () => {
  const result = setCartItemQuantity(cart, "145", 0);
  assert.deepEqual(result.items, [{ productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 }]);
});

test("setCartItemQuantity throws when quantity is negative", () => {
  assert.throws(() => setCartItemQuantity(cart, "145", -1));
});

test("setCartItemQuantity throws when quantity is not an integer", () => {
  assert.throws(() => setCartItemQuantity(cart, "145", 1.5));
});

test("setCartItemQuantity throws when the productId is not in the cart", () => {
  assert.throws(() => setCartItemQuantity(cart, "999", 3));
});
