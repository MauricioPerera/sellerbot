import { test } from "node:test";
import assert from "node:assert/strict";
import { viewCartTool } from "./view_cart.ts";
import { openCartDb } from "../cart/cart_db.ts";
import type { Cart } from "../cart/cart_db.ts";

function seededDb(cart: Cart) {
  const db = openCartDb(":memory:");
  db.saveCart(cart);
  return db;
}

test("view_cart tool declares its OpenAI-facing shape", () => {
  const db = openCartDb(":memory:");
  const tool = viewCartTool(db, "conv-1");
  assert.equal(tool.name, "view_cart");
  assert.deepEqual(tool.parameters.required ?? [], []);
  db.close();
});

test("view_cart tool execute() on an empty/missing cart returns an empty summary", async () => {
  const db = openCartDb(":memory:");
  const tool = viewCartTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.deepEqual(result, { items: [], totalCents: 0 });
  db.close();
});

test("view_cart tool execute() returns the summary with subtotals and total", async () => {
  const cart: Cart = {
    conversationId: "conv-1",
    items: [
      { productId: "145", name: "Abominable Hoodie", quantity: 2, unitPriceCents: 6900 },
      { productId: "193", name: "Ajax Full-Zip Sweatshirt", quantity: 1, unitPriceCents: 5500 },
    ],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const tool = viewCartTool(db, "conv-1");
  const result: any = await tool.execute({});
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].subtotalCents, 13800);
  assert.equal(result.totalCents, 19300);
  db.close();
});

test("view_cart tool execute() keeps separate carts per conversationId", async () => {
  const cart: Cart = {
    conversationId: "conv-a",
    items: [{ productId: "145", name: "Abominable Hoodie", quantity: 1, unitPriceCents: 6900 }],
    updatedAt: "2026-08-14T00:00:00.000Z",
  };
  const db = seededDb(cart);
  const tool = viewCartTool(db, "conv-b");
  const result: any = await tool.execute({});
  assert.deepEqual(result, { items: [], totalCents: 0 });
  db.close();
});
