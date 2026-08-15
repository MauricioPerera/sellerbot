import { test } from "node:test";
import assert from "node:assert/strict";
import {
  updateConversationState,
  describeProduct,
  buildResumeContext,
} from "./conversation_context.ts";
import type { AgentMessage } from "../agent_loop.ts";
import type { ConversationDb, ConversationState } from "./conversation_db.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

function fakeDb(initial: ConversationState | null): ConversationDb & { saved: ConversationState[] } {
  let state = initial;
  const saved: ConversationState[] = [];
  return {
    saved,
    getState(): ConversationState | null {
      return state;
    },
    saveState(next: ConversationState): void {
      state = next;
      saved.push(next);
    },
    close(): void {},
  };
}

function assistantToolCall(id: string, name: string, args: unknown): AgentMessage {
  return {
    role: "assistant",
    content: null,
    tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  };
}

function toolResult(id: string, content: unknown): AgentMessage {
  return { role: "tool", content: JSON.stringify(content), tool_call_id: id };
}

const CATALOG: DbProduct[] = [
  { id: "p1", name: "Remera Roja", priceCents: 1000 } as DbProduct,
  { id: "p2", name: "Buzo Negro", priceCents: 2000 } as DbProduct,
];

// --- updateConversationState -----------------------------------------------

test("updateConversationState with no messages and no prior state saves nulls", () => {
  const db = fakeDb(null);
  updateConversationState([], db, "conv-1");
  assert.equal(db.saved.length, 1);
  assert.equal(db.saved[0].conversationId, "conv-1");
  assert.equal(db.saved[0].lastSearchQuery, null);
  assert.deepEqual(db.saved[0].lastSearchResultIds, []);
  assert.equal(db.saved[0].lastViewedProductId, null);
});

test("updateConversationState with no messages carries forward prior state", () => {
  const prior: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: "remeras",
    lastSearchResultIds: ["p1"],
    lastViewedProductId: "p2",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const db = fakeDb(prior);
  updateConversationState([], db, "conv-1");
  assert.equal(db.saved[0].lastSearchQuery, "remeras");
  assert.deepEqual(db.saved[0].lastSearchResultIds, ["p1"]);
  assert.equal(db.saved[0].lastViewedProductId, "p2");
});

test("updateConversationState extracts lastSearchQuery/lastSearchResultIds from a search_products call", () => {
  const db = fakeDb(null);
  const messages: AgentMessage[] = [
    assistantToolCall("call-1", "search_products", { query: "remeras" }),
    toolResult("call-1", { results: [{ id: "p1" }, { id: "p2" }] }),
  ];
  updateConversationState(messages, db, "conv-1");
  const saved = db.saved[0];
  assert.equal(saved.lastSearchQuery, "remeras");
  assert.deepEqual(saved.lastSearchResultIds, ["p1", "p2"]);
});

test("updateConversationState extracts lastViewedProductId from a get_product_detail call", () => {
  const db = fakeDb(null);
  const messages: AgentMessage[] = [
    assistantToolCall("call-1", "get_product_detail", { id: "p2" }),
    toolResult("call-1", { product: { id: "p2" } }),
  ];
  updateConversationState(messages, db, "conv-1");
  assert.equal(db.saved[0].lastViewedProductId, "p2");
});

test("updateConversationState re-scans the whole history and keeps the latest matching call", () => {
  const db = fakeDb(null);
  const messages: AgentMessage[] = [
    assistantToolCall("call-1", "search_products", { query: "remeras" }),
    toolResult("call-1", { results: [{ id: "p1" }] }),
    assistantToolCall("call-2", "search_products", { query: "buzos" }),
    toolResult("call-2", { results: [{ id: "p2" }] }),
  ];
  updateConversationState(messages, db, "conv-1");
  const saved = db.saved[0];
  assert.equal(saved.lastSearchQuery, "buzos");
  assert.deepEqual(saved.lastSearchResultIds, ["p2"]);
});

test("updateConversationState ignores a tool_call with no matching tool result message", () => {
  const db = fakeDb(null);
  const messages: AgentMessage[] = [assistantToolCall("call-1", "search_products", { query: "remeras" })];
  updateConversationState(messages, db, "conv-1");
  assert.equal(db.saved[0].lastSearchQuery, null);
});

test("updateConversationState ignores a tool result whose content is not valid JSON", () => {
  const db = fakeDb(null);
  const messages: AgentMessage[] = [
    assistantToolCall("call-1", "search_products", { query: "remeras" }),
    { role: "tool", content: "not json", tool_call_id: "call-1" },
  ];
  updateConversationState(messages, db, "conv-1");
  assert.equal(db.saved[0].lastSearchQuery, null);
});

test("updateConversationState ignores assistant messages without tool_calls and non-assistant messages", () => {
  const db = fakeDb(null);
  const messages: AgentMessage[] = [
    { role: "user", content: "hola" },
    { role: "assistant", content: "hola, en que te ayudo?" },
  ];
  updateConversationState(messages, db, "conv-1");
  assert.equal(db.saved[0].lastSearchQuery, null);
  assert.equal(db.saved[0].lastViewedProductId, null);
});

test("updateConversationState saves conversationId and a fresh updatedAt", () => {
  const db = fakeDb(null);
  updateConversationState([], db, "conv-42");
  assert.equal(db.saved[0].conversationId, "conv-42");
  assert.equal(typeof db.saved[0].updatedAt, "string");
  assert.ok(!Number.isNaN(Date.parse(db.saved[0].updatedAt)));
});

// --- describeProduct ---------------------------------------------------------

test("describeProduct returns name and id when the product is in the catalog", () => {
  assert.equal(describeProduct(CATALOG, "p1"), "Remera Roja (id: p1)");
});

test("describeProduct returns a fallback message when the id is not in the catalog", () => {
  assert.equal(describeProduct(CATALOG, "p999"), "id p999 (ya no esta en el catalogo)");
});

// --- buildResumeContext -------------------------------------------------------

test("buildResumeContext returns null when there is no prior state", () => {
  assert.equal(buildResumeContext(CATALOG, null), null);
});

test("buildResumeContext returns null when the state has no search and no viewed product", () => {
  const state: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: null,
    lastSearchResultIds: [],
    lastViewedProductId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(buildResumeContext(CATALOG, state), null);
});

test("buildResumeContext describes the last search when query and results are present", () => {
  const state: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: "remeras",
    lastSearchResultIds: ["p1", "p2"],
    lastViewedProductId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const context = buildResumeContext(CATALOG, state);
  assert.ok(context !== null);
  assert.match(context, /remeras/);
  assert.match(context, /Remera Roja \(id: p1\)/);
  assert.match(context, /Buzo Negro \(id: p2\)/);
});

test("buildResumeContext describes the last viewed product when present", () => {
  const state: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: null,
    lastSearchResultIds: [],
    lastViewedProductId: "p2",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const context = buildResumeContext(CATALOG, state);
  assert.ok(context !== null);
  assert.match(context, /Buzo Negro \(id: p2\)/);
});

test("buildResumeContext combines search and viewed product when both are present", () => {
  const state: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: "remeras",
    lastSearchResultIds: ["p1"],
    lastViewedProductId: "p2",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const context = buildResumeContext(CATALOG, state);
  assert.ok(context !== null);
  assert.match(context, /remeras/);
  assert.match(context, /Buzo Negro \(id: p2\)/);
});

test("buildResumeContext includes the conversationId in the message", () => {
  const state: ConversationState = {
    conversationId: "conv-xyz",
    lastSearchQuery: "remeras",
    lastSearchResultIds: ["p1"],
    lastViewedProductId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const context = buildResumeContext(CATALOG, state);
  assert.match(context as string, /conv-xyz/);
});

test("buildResumeContext skips a search with a query but zero results", () => {
  const state: ConversationState = {
    conversationId: "conv-1",
    lastSearchQuery: "algo raro",
    lastSearchResultIds: [],
    lastViewedProductId: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(buildResumeContext(CATALOG, state), null);
});
