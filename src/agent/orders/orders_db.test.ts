import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openOrdersDb } from "./orders_db.ts";
import type { OrderItem } from "./orders_db.ts";

const sampleItems: OrderItem[] = [
  { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
];

test("openOrdersDb createOrder creates a pending_payment order with a pending payment", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  assert.equal(order.conversationId, "conv-1");
  assert.equal(order.status, "pending_payment");
  assert.deepEqual(order.items, sampleItems);
  assert.equal(order.totalCents, 13800);
  assert.equal(typeof order.id, "string");
  assert.notEqual(order.id, "");
  assert.equal(typeof order.payToken, "string");
  assert.notEqual(order.payToken, "");

  const payment = db.getPayment(order.id);
  assert.equal(payment?.status, "pending");
  assert.equal(payment?.orderId, order.id);
  db.close();
});

test("openOrdersDb createOrder generates a unique payToken per order", () => {
  const db = openOrdersDb(":memory:");
  const order1 = db.createOrder("conv-1", sampleItems, 13800);
  const order2 = db.createOrder("conv-1", sampleItems, 13800);
  assert.notEqual(order1.payToken, order2.payToken);
  assert.notEqual(order1.id, order2.id);
  db.close();
});

test("openOrdersDb createOrder throws when items is empty", () => {
  const db = openOrdersDb(":memory:");
  assert.throws(() => db.createOrder("conv-1", [], 0));
  db.close();
});

test("openOrdersDb getOrder returns null for an unknown id", () => {
  const db = openOrdersDb(":memory:");
  assert.equal(db.getOrder("missing"), null);
  db.close();
});

test("openOrdersDb getOrder round-trips a created order", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  assert.deepEqual(db.getOrder(order.id), order);
  db.close();
});

test("openOrdersDb getOrderByPayToken resolves an order by its pay link token", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  assert.deepEqual(db.getOrderByPayToken(order.payToken), order);
  db.close();
});

test("openOrdersDb getOrderByPayToken returns null for an unknown token", () => {
  const db = openOrdersDb(":memory:");
  assert.equal(db.getOrderByPayToken("missing"), null);
  db.close();
});

test("openOrdersDb getPayment returns null for an unknown orderId", () => {
  const db = openOrdersDb(":memory:");
  assert.equal(db.getPayment("missing"), null);
  db.close();
});

test("openOrdersDb setPaymentResult(approved) moves the order to paid and the payment to approved", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  const result = db.setPaymentResult(order.id, "approved");
  assert.equal(result.order.status, "paid");
  assert.equal(result.payment.status, "approved");
  assert.equal(db.getOrder(order.id)?.status, "paid");
  db.close();
});

test("openOrdersDb setPaymentResult(rejected) moves the order to payment_failed and the payment to rejected", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  const result = db.setPaymentResult(order.id, "rejected");
  assert.equal(result.order.status, "payment_failed");
  assert.equal(result.payment.status, "rejected");
  db.close();
});

test("openOrdersDb setPaymentResult throws when the order does not exist", () => {
  const db = openOrdersDb(":memory:");
  assert.throws(() => db.setPaymentResult("missing", "approved"));
  db.close();
});

test("openOrdersDb setPaymentResult throws when the payment is already resolved (no double-approval)", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  db.setPaymentResult(order.id, "approved");
  assert.throws(() => db.setPaymentResult(order.id, "approved"));
  assert.throws(() => db.setPaymentResult(order.id, "rejected"));
  db.close();
});

test("openOrdersDb listEvents records order_created then the payment outcome, chronologically", () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 13800);
  db.setPaymentResult(order.id, "approved");
  const events = db.listEvents(order.id);
  assert.equal(events.length, 2);
  assert.equal(events[0].type, "order_created");
  assert.equal(events[1].type, "payment_approved");
  db.close();
});

test("openOrdersDb listEvents returns an empty array for an unknown orderId", () => {
  const db = openOrdersDb(":memory:");
  assert.deepEqual(db.listEvents("missing"), []);
  db.close();
});

test("openOrdersDb reopening the same file keeps prior orders (survives a process restart)", () => {
  const file = path.join(os.tmpdir(), `orders-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openOrdersDb(file);
  const order = db1.createOrder("conv-1", sampleItems, 13800);
  db1.close();

  const db2 = openOrdersDb(file);
  assert.deepEqual(db2.getOrder(order.id), order);
  db2.close();

  fs.rmSync(file, { force: true });
});
