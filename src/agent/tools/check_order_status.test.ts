import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOrderStatusTool } from "./check_order_status.ts";
import { openOrdersDb } from "../orders/orders_db.ts";
import type { OrderItem } from "../orders/orders_db.ts";

const sampleItems: OrderItem[] = [
  { productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 },
];

test("check_order_status tool declares its OpenAI-facing shape", () => {
  const db = openOrdersDb(":memory:");
  const tool = checkOrderStatusTool(db);
  assert.equal(tool.name, "check_order_status");
  assert.equal(tool.parameters.required?.includes("order_id"), true);
  db.close();
});

test("check_order_status tool execute() returns the order's current status", async () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 6900);
  const tool = checkOrderStatusTool(db);
  const result: any = await tool.execute({ order_id: order.id });
  assert.equal(result.order_id, order.id);
  assert.equal(result.status, "pending_payment");
  assert.equal(result.total_cents, 6900);
  db.close();
});

test("check_order_status tool execute() reflects a status change after payment resolution", async () => {
  const db = openOrdersDb(":memory:");
  const order = db.createOrder("conv-1", sampleItems, 6900);
  db.setPaymentResult(order.id, "approved");
  const tool = checkOrderStatusTool(db);
  const result: any = await tool.execute({ order_id: order.id });
  assert.equal(result.status, "paid");
  db.close();
});

test("check_order_status tool execute() returns a structured error for an unknown order_id", async () => {
  const db = openOrdersDb(":memory:");
  const tool = checkOrderStatusTool(db);
  const result: any = await tool.execute({ order_id: "missing" });
  assert.equal(result.error, "no order found with id missing");
  db.close();
});

test("check_order_status tool execute() rejects a non-string order_id", async () => {
  const db = openOrdersDb(":memory:");
  const tool = checkOrderStatusTool(db);
  const result: any = await tool.execute({ order_id: 1 });
  assert.equal(result.error, "order_id must be a string");
  db.close();
});
