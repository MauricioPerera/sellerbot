import { test } from "node:test";
import assert from "node:assert/strict";
import { filterOrders } from "./filter_orders.ts";
import type { Order } from "./orders_db.ts";

function makeOrder(overrides: Partial<Order>): Order {
  return {
    id: "order-1",
    conversationId: "conv-1",
    status: "pending_payment",
    items: [],
    totalCents: 1000,
    payToken: "tok-1",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

const orders: Order[] = [
  makeOrder({ id: "order-a", status: "pending_payment", createdAt: "2026-08-10T00:00:00.000Z" }),
  makeOrder({ id: "order-b", status: "paid", createdAt: "2026-08-12T00:00:00.000Z" }),
  makeOrder({ id: "order-c", status: "shipped", createdAt: "2026-08-14T00:00:00.000Z" }),
];

test("filterOrders with no filters returns every order unchanged", () => {
  assert.deepEqual(filterOrders(orders, {}), orders);
});

test("filterOrders does not mutate the input array", () => {
  filterOrders(orders, { status: "paid" });
  assert.equal(orders.length, 3);
});

test("filterOrders filters by exact status", () => {
  const result = filterOrders(orders, { status: "paid" });
  assert.deepEqual(result.map((o) => o.id), ["order-b"]);
});

test("filterOrders filters by a case-insensitive substring of id", () => {
  const result = filterOrders(orders, { id: "ORDER-A" });
  assert.deepEqual(result.map((o) => o.id), ["order-a"]);
});

test("filterOrders filters by dateFrom (inclusive)", () => {
  const result = filterOrders(orders, { dateFrom: "2026-08-12T00:00:00.000Z" });
  assert.deepEqual(result.map((o) => o.id), ["order-b", "order-c"]);
});

test("filterOrders filters by dateTo (inclusive)", () => {
  const result = filterOrders(orders, { dateTo: "2026-08-12T00:00:00.000Z" });
  assert.deepEqual(result.map((o) => o.id), ["order-a", "order-b"]);
});

test("filterOrders composes status, id, and date filters with AND logic", () => {
  const result = filterOrders(orders, { status: "paid", id: "order-b", dateFrom: "2026-08-01T00:00:00.000Z" });
  assert.deepEqual(result.map((o) => o.id), ["order-b"]);
});

test("filterOrders returns an empty array when nothing matches", () => {
  assert.deepEqual(filterOrders(orders, { status: "cancelled" }), []);
});

test("filterOrders on an empty orders array returns an empty array", () => {
  assert.deepEqual(filterOrders([], { status: "paid" }), []);
});
