import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openCartDb } from "./cart_db.ts";
import type { Cart } from "./cart_db.ts";

const sampleCart: Cart = {
  conversationId: "conv-1",
  items: [
    { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
    { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
  ],
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("openCartDb getCart returns null on a fresh db", () => {
  const db = openCartDb(":memory:");
  assert.equal(db.getCart("conv-1"), null);
  db.close();
});

test("openCartDb round-trips a saved cart", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  assert.deepEqual(db.getCart("conv-1"), sampleCart);
  db.close();
});

test("openCartDb saveCart overwrites the previous cart for the same conversationId", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  const updated: Cart = {
    conversationId: "conv-1",
    items: [],
    updatedAt: "2026-08-14T00:05:00.000Z",
  };
  db.saveCart(updated);
  assert.deepEqual(db.getCart("conv-1"), updated);
  db.close();
});

test("openCartDb keeps separate carts per conversationId", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  assert.equal(db.getCart("conv-2"), null);
  db.close();
});

test("openCartDb round-trips a cart item with a null unitPriceCents", () => {
  const db = openCartDb(":memory:");
  const cart: Cart = {
    conversationId: "conv-3",
    items: [{ productId: "50", name: "Mystery Item", quantity: 1, unitPriceCents: null }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  db.saveCart(cart);
  assert.deepEqual(db.getCart("conv-3"), cart);
  db.close();
});

test("openCartDb reopening the same file keeps the prior cart (survives a process restart)", () => {
  const file = path.join(os.tmpdir(), `cart-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openCartDb(file);
  db1.saveCart(sampleCart);
  db1.close();

  const db2 = openCartDb(file);
  assert.deepEqual(db2.getCart("conv-1"), sampleCart);
  db2.close();

  fs.rmSync(file, { force: true });
});
