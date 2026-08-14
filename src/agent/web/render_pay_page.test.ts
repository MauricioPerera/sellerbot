import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPayPage } from "./render_pay_page.ts";
import type { Order } from "../orders/orders_db.ts";

const baseOrder: Order = {
  id: "order-1",
  conversationId: "conv-1",
  status: "pending_payment",
  items: [{ productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 }],
  totalCents: 13800,
  payToken: "tok-1",
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("renderPayPage includes the order id", () => {
  const html = renderPayPage(baseOrder);
  assert.ok(html.includes("order-1"));
});

test("renderPayPage formats the total in ARS with comma decimals", () => {
  const html = renderPayPage(baseOrder);
  assert.ok(html.includes("$ 138,00"));
});

test("renderPayPage formats a total over 1000 pesos with a thousands separator", () => {
  const order: Order = { ...baseOrder, totalCents: 150000 };
  const html = renderPayPage(order);
  assert.ok(html.includes("$ 1.500,00"));
});

test("renderPayPage lists each item's name, quantity, and formatted unit price", () => {
  const html = renderPayPage(baseOrder);
  assert.ok(html.includes("Abominable Hoodie"));
  assert.ok(html.includes("2"));
  assert.ok(html.includes("$ 69,00"));
});

test("renderPayPage on a pending_payment order includes approve and reject forms posting to the payToken", () => {
  const html = renderPayPage(baseOrder);
  assert.match(html, /<form[^>]*action="\/pay\/tok-1\/approve"[^>]*method="post"/);
  assert.match(html, /<form[^>]*action="\/pay\/tok-1\/reject"[^>]*method="post"/);
});

test("renderPayPage on a paid order shows an approved message and no forms", () => {
  const order: Order = { ...baseOrder, status: "paid" };
  const html = renderPayPage(order);
  assert.ok(!html.includes("<form"));
  assert.match(html, /aprobad/i);
});

test("renderPayPage on a payment_failed order shows a rejected message and no forms", () => {
  const order: Order = { ...baseOrder, status: "payment_failed" };
  const html = renderPayPage(order);
  assert.ok(!html.includes("<form"));
  assert.match(html, /rechazad/i);
});

test("renderPayPage on a cancelled order shows a cancelled message and no forms", () => {
  const order: Order = { ...baseOrder, status: "cancelled" };
  const html = renderPayPage(order);
  assert.ok(!html.includes("<form"));
  assert.match(html, /cancelad/i);
});

test("renderPayPage escapes HTML in an item name instead of executing it", () => {
  const order: Order = {
    ...baseOrder,
    items: [{ productId: "1", name: "<script>alert(1)</script>", quantity: 1, unitPriceCents: 100 }],
  };
  const html = renderPayPage(order);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});
