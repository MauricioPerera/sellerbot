import { test } from "node:test";
import assert from "node:assert/strict";
import { addCartItem } from "./cart_add_item.ts";
import type { Cart } from "./cart_db.ts";

const emptyCart: Cart = { conversationId: "conv-1", items: [], updatedAt: "2026-08-14T00:00:00.000Z" };

test("addCartItem appends a new item to an empty cart", () => {
  const result = addCartItem(emptyCart, { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 });
  assert.deepEqual(result.items, [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }]);
});

test("addCartItem does not mutate the input cart", () => {
  addCartItem(emptyCart, { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 });
  assert.deepEqual(emptyCart.items, []);
});

test("addCartItem preserves the cart's conversationId and updatedAt", () => {
  const result = addCartItem(emptyCart, { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 });
  assert.equal(result.conversationId, "conv-1");
  assert.equal(result.updatedAt, "2026-08-14T00:00:00.000Z");
});

test("addCartItem sums the quantity when the same productId is added again", () => {
  const cartWithItem: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = addCartItem(cartWithItem, { productId: "145", name: "Abominable Hoodie", quantity: 3, unitPriceCents: 6900 });
  assert.deepEqual(result.items, [{ productId: "145", name: "Abominable Hoodie", quantity: 5, unitPriceCents: 6900 }]);
});

test("addCartItem refreshes name and unitPriceCents to the latest snapshot when merging quantities", () => {
  const cartWithItem: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = addCartItem(cartWithItem, { productId: "145", name: "Abominable Hoodie (Sale)", quantity: 1, unitPriceCents: 5900 });
  assert.deepEqual(result.items, [{ productId: "145", name: "Abominable Hoodie (Sale)", quantity: 2, unitPriceCents: 5900 }]);
});

test("addCartItem keeps unrelated items untouched when merging one of them", () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [
      { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 },
      { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
    ],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = addCartItem(cart, { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 });
  assert.deepEqual(result.items, [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ]);
});

test("addCartItem throws when quantity is zero", () => {
  assert.throws(() => addCartItem(emptyCart, { productId: "145", name: "Abominable Hoodie", quantity: 0, unitPriceCents: 6900 }));
});

test("addCartItem throws when quantity is negative", () => {
  assert.throws(() => addCartItem(emptyCart, { productId: "145", name: "Abominable Hoodie", quantity: -1, unitPriceCents: 6900 }));
});

test("addCartItem throws when quantity is not an integer", () => {
  assert.throws(() => addCartItem(emptyCart, { productId: "145", name: "Abominable Hoodie", quantity: 1.5, unitPriceCents: 6900 }));
});
