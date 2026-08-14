import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openPromotionsDb } from "./promotions_db.ts";
import type { CreatePromotionInput } from "./promotions_db.ts";

const sampleInput: CreatePromotionInput = {
  triggerProductId: "145",
  discountProductId: "193",
  discountType: "percentage",
  discountValue: 50,
  combinableWithCoupons: true,
};

test("openPromotionsDb createPromotion creates an active promotion with a generated id", () => {
  const db = openPromotionsDb(":memory:");
  const promotion = db.createPromotion(sampleInput);
  assert.equal(promotion.triggerProductId, "145");
  assert.equal(promotion.discountProductId, "193");
  assert.equal(promotion.discountType, "percentage");
  assert.equal(promotion.discountValue, 50);
  assert.equal(promotion.combinableWithCoupons, true);
  assert.equal(promotion.active, true);
  assert.equal(typeof promotion.id, "string");
  assert.notEqual(promotion.id, "");
  db.close();
});

test("openPromotionsDb createPromotion generates a unique id per promotion", () => {
  const db = openPromotionsDb(":memory:");
  const a = db.createPromotion(sampleInput);
  const b = db.createPromotion(sampleInput);
  assert.notEqual(a.id, b.id);
  db.close();
});

test("openPromotionsDb getPromotion returns null for an unknown id", () => {
  const db = openPromotionsDb(":memory:");
  assert.equal(db.getPromotion("missing"), null);
  db.close();
});

test("openPromotionsDb getPromotion round-trips a created promotion", () => {
  const db = openPromotionsDb(":memory:");
  const promotion = db.createPromotion(sampleInput);
  assert.deepEqual(db.getPromotion(promotion.id), promotion);
  db.close();
});

test("openPromotionsDb listPromotions returns an empty array on a fresh db", () => {
  const db = openPromotionsDb(":memory:");
  assert.deepEqual(db.listPromotions(), []);
  db.close();
});

test("openPromotionsDb listPromotions returns all promotions, newest first", () => {
  const db = openPromotionsDb(":memory:");
  const a = db.createPromotion(sampleInput);
  const b = db.createPromotion({ ...sampleInput, discountProductId: "999" });
  const list = db.listPromotions();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, b.id);
  assert.equal(list[1].id, a.id);
  db.close();
});

test("openPromotionsDb listPromotions includes inactive promotions", () => {
  const db = openPromotionsDb(":memory:");
  const promotion = db.createPromotion(sampleInput);
  db.setActive(promotion.id, false);
  const list = db.listPromotions();
  assert.equal(list.length, 1);
  assert.equal(list[0].active, false);
  db.close();
});

test("openPromotionsDb setActive(false) deactivates a promotion", () => {
  const db = openPromotionsDb(":memory:");
  const promotion = db.createPromotion(sampleInput);
  const updated = db.setActive(promotion.id, false);
  assert.equal(updated.active, false);
  assert.equal(db.getPromotion(promotion.id)?.active, false);
  db.close();
});

test("openPromotionsDb setActive(true) reactivates a promotion", () => {
  const db = openPromotionsDb(":memory:");
  const promotion = db.createPromotion(sampleInput);
  db.setActive(promotion.id, false);
  const updated = db.setActive(promotion.id, true);
  assert.equal(updated.active, true);
  db.close();
});

test("openPromotionsDb setActive throws when the promotion does not exist", () => {
  const db = openPromotionsDb(":memory:");
  assert.throws(() => db.setActive("missing", false));
  db.close();
});

test("openPromotionsDb deletePromotion removes the promotion", () => {
  const db = openPromotionsDb(":memory:");
  const promotion = db.createPromotion(sampleInput);
  db.deletePromotion(promotion.id);
  assert.equal(db.getPromotion(promotion.id), null);
  assert.deepEqual(db.listPromotions(), []);
  db.close();
});

test("openPromotionsDb deletePromotion is idempotent for an unknown id", () => {
  const db = openPromotionsDb(":memory:");
  assert.doesNotThrow(() => db.deletePromotion("missing"));
  db.close();
});

test("openPromotionsDb reopening the same file keeps prior promotions (survives a process restart)", () => {
  const file = path.join(os.tmpdir(), `promotions-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openPromotionsDb(file);
  const promotion = db1.createPromotion(sampleInput);
  db1.close();

  const db2 = openPromotionsDb(file);
  assert.deepEqual(db2.getPromotion(promotion.id), promotion);
  db2.close();

  fs.rmSync(file, { force: true });
});
