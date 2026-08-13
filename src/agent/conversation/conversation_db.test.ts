import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { openConversationDb } from "./conversation_db.ts";
import type { ConversationState } from "./conversation_db.ts";

const sampleState: ConversationState = {
  conversationId: "conv-1",
  lastSearchQuery: "hoodie",
  lastSearchResultIds: ["30", "20", "17"],
  lastViewedProductId: null,
  updatedAt: "2026-08-14T00:00:00.000Z",
};

test("openConversationDb getState returns null on a fresh db", () => {
  const db = openConversationDb(":memory:");
  assert.equal(db.getState("conv-1"), null);
  db.close();
});

test("openConversationDb round-trips a saved state", () => {
  const db = openConversationDb(":memory:");
  db.saveState(sampleState);
  assert.deepEqual(db.getState("conv-1"), sampleState);
  db.close();
});

test("openConversationDb saveState overwrites the previous state for the same conversationId", () => {
  const db = openConversationDb(":memory:");
  db.saveState(sampleState);
  const updated: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: null,
    lastSearchResultIds: [],
    lastViewedProductId: "17",
    updatedAt: "2026-08-14T00:05:00.000Z",
  };
  db.saveState(updated);
  assert.deepEqual(db.getState("conv-1"), updated);
  db.close();
});

test("openConversationDb keeps separate state per conversationId", () => {
  const db = openConversationDb(":memory:");
  db.saveState(sampleState);
  assert.equal(db.getState("conv-2"), null);
  db.close();
});

test("openConversationDb reopening the same file keeps prior state (survives a process restart)", () => {
  const file = path.join(os.tmpdir(), `conversation-test-${Date.now()}-${Math.random()}.sqlite`);
  const db1 = openConversationDb(file);
  db1.saveState(sampleState);
  db1.close();

  const db2 = openConversationDb(file);
  assert.deepEqual(db2.getState("conv-1"), sampleState);
  db2.close();

  fs.rmSync(file, { force: true });
});
