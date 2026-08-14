import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCart } from "./cart_summary.ts";
import type { Cart } from "./cart_db.ts";

test("summarizeCart on an empty cart returns no items and a zero total", () => {
  const cart: Cart = { conversationId: "conv-1", items: [], updatedAt: "2026-08-14T00:00:00.000Z" };
  assert.deepEqual(summarizeCart(cart), { items: [], totalCents: 0 });
});

test("summarizeCart computes a subtotal per item and the cart total", () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [
      { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
      { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
    ],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = summarizeCart(cart);
  assert.deepEqual(result.items, [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900, subtotalCents: 13800 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500, subtotalCents: 5500 },
  ]);
  assert.equal(result.totalCents, 19300);
});

test("summarizeCart sets subtotalCents to null for an item with no price", () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "50", name: "Mystery Item", quantity: 3, unitPriceCents: null }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = summarizeCart(cart);
  assert.equal(result.items[0].subtotalCents, null);
});

test("summarizeCart sets totalCents to null when any item has no price", () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [
      { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 },
      { productId: "50", name: "Mystery Item", quantity: 1, unitPriceCents: null },
    ],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const result = summarizeCart(cart);
  assert.equal(result.totalCents, null);
});

test("summarizeCart does not mutate the input cart", () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  summarizeCart(cart);
  assert.deepEqual(cart.items[0], { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 });
});
