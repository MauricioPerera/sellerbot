import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

test("openCartDb getCouponCode returns null for a conversation with no cart", () => {
  const db = openCartDb(":memory:");
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("openCartDb getCouponCode returns null when a cart exists but has no coupon applied", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("openCartDb setCouponCode sets the coupon code on an existing cart", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setCouponCode("conv-1", "WELCOME10");
  assert.equal(db.getCouponCode("conv-1"), "WELCOME10");
  db.close();
});

test("openCartDb setCouponCode(null) clears a previously applied coupon", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setCouponCode("conv-1", "WELCOME10");
  db.setCouponCode("conv-1", null);
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("openCartDb setCouponCode does not alter the cart's items or updatedAt", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setCouponCode("conv-1", "WELCOME10");
  const cart = db.getCart("conv-1");
  assert.deepEqual(cart?.items, sampleCart.items);
  assert.equal(cart?.updatedAt, sampleCart.updatedAt);
  db.close();
});

test("openCartDb setCouponCode throws when applying a code to a conversation with no cart", () => {
  const db = openCartDb(":memory:");
  assert.throws(() => db.setCouponCode("conv-1", "WELCOME10"));
  db.close();
});

test("openCartDb setCouponCode(null) is a no-op when there is no cart", () => {
  const db = openCartDb(":memory:");
  db.setCouponCode("conv-1", null);
  assert.equal(db.getCouponCode("conv-1"), null);
  db.close();
});

test("openCartDb keeps coupon codes separate per conversationId", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.saveCart({ conversationId: "conv-2", items: sampleCart.items, updatedAt: sampleCart.updatedAt });
  db.setCouponCode("conv-1", "WELCOME10");
  assert.equal(db.getCouponCode("conv-2"), null);
  db.close();
});

test("openCartDb coupon code survives reopening the file (process restart)", () => {
  const file = path.join(os.tmpdir(), `cart-coupon-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openCartDb(file);
  db1.saveCart(sampleCart);
  db1.setCouponCode("conv-1", "WELCOME10");
  db1.close();

  const db2 = openCartDb(file);
  assert.equal(db2.getCouponCode("conv-1"), "WELCOME10");
  db2.close();

  fs.rmSync(file, { force: true });
});

test("openCartDb getPromotionId returns null for a conversation with no cart", () => {
  const db = openCartDb(":memory:");
  assert.equal(db.getPromotionId("conv-1"), null);
  db.close();
});

test("openCartDb getPromotionId returns null when a cart exists but has no promotion applied", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  assert.equal(db.getPromotionId("conv-1"), null);
  db.close();
});

test("openCartDb setPromotionId sets the promotion id on an existing cart", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setPromotionId("conv-1", "promo-1");
  assert.equal(db.getPromotionId("conv-1"), "promo-1");
  db.close();
});

test("openCartDb setPromotionId(null) clears a previously applied promotion", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setPromotionId("conv-1", "promo-1");
  db.setPromotionId("conv-1", null);
  assert.equal(db.getPromotionId("conv-1"), null);
  db.close();
});

test("openCartDb setPromotionId does not alter the cart's items or updatedAt", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setPromotionId("conv-1", "promo-1");
  const cart = db.getCart("conv-1");
  assert.deepEqual(cart?.items, sampleCart.items);
  assert.equal(cart?.updatedAt, sampleCart.updatedAt);
  db.close();
});

test("openCartDb setPromotionId does not alter a previously applied coupon code", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.setCouponCode("conv-1", "WELCOME10");
  db.setPromotionId("conv-1", "promo-1");
  assert.equal(db.getCouponCode("conv-1"), "WELCOME10");
  assert.equal(db.getPromotionId("conv-1"), "promo-1");
  db.close();
});

test("openCartDb setPromotionId throws when applying an id to a conversation with no cart", () => {
  const db = openCartDb(":memory:");
  assert.throws(() => db.setPromotionId("conv-1", "promo-1"));
  db.close();
});

test("openCartDb setPromotionId(null) is a no-op when there is no cart", () => {
  const db = openCartDb(":memory:");
  db.setPromotionId("conv-1", null);
  assert.equal(db.getPromotionId("conv-1"), null);
  db.close();
});

test("openCartDb keeps promotion ids separate per conversationId", () => {
  const db = openCartDb(":memory:");
  db.saveCart(sampleCart);
  db.saveCart({ conversationId: "conv-2", items: sampleCart.items, updatedAt: sampleCart.updatedAt });
  db.setPromotionId("conv-1", "promo-1");
  assert.equal(db.getPromotionId("conv-2"), null);
  db.close();
});

test("openCartDb promotion id survives reopening the file (process restart)", () => {
  const file = path.join(os.tmpdir(), `cart-promotion-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openCartDb(file);
  db1.saveCart(sampleCart);
  db1.setPromotionId("conv-1", "promo-1");
  db1.close();

  const db2 = openCartDb(file);
  assert.equal(db2.getPromotionId("conv-1"), "promo-1");
  db2.close();

  fs.rmSync(file, { force: true });
});

test("openCartDb migrates an older carts table that has no promotionId column yet", () => {
  const file = path.join(os.tmpdir(), `cart-migrate-test-${Date.now()}-${Math.random()}.sqlite`);
  const legacy = new DatabaseSync(file);
  legacy.exec(`
    CREATE TABLE carts (
      conversationId TEXT PRIMARY KEY,
      items TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      couponCode TEXT
    )
  `);
  legacy.prepare(
    "INSERT INTO carts (conversationId, items, updatedAt, couponCode) VALUES (?, ?, ?, ?)",
  ).run("conv-1", JSON.stringify(sampleCart.items), sampleCart.updatedAt, "WELCOME10");
  legacy.close();

  const db = openCartDb(file);
  assert.deepEqual(db.getCart("conv-1"), sampleCart);
  assert.equal(db.getCouponCode("conv-1"), "WELCOME10");
  assert.equal(db.getPromotionId("conv-1"), null);
  db.setPromotionId("conv-1", "promo-1");
  assert.equal(db.getPromotionId("conv-1"), "promo-1");
  db.close();

  fs.rmSync(file, { force: true });
});
