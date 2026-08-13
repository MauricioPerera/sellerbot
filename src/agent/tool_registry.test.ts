import { test } from "node:test";
import assert from "node:assert/strict";
import { createToolRegistry } from "./tool_registry.ts";
import type { AgentTool } from "./tool_registry.ts";

const dummyTool = (name: string): AgentTool => ({
  name,
  description: `Dummy tool ${name}`,
  parameters: { type: "object", properties: {} },
  execute: async () => ({ ok: true }),
});

test("createToolRegistry indexes tools by name", () => {
  const registry = createToolRegistry([dummyTool("a"), dummyTool("b")]);
  assert.equal(registry.size, 2);
  assert.equal(registry.get("a")?.name, "a");
  assert.equal(registry.get("b")?.name, "b");
});

test("createToolRegistry returns undefined for unknown tool", () => {
  const registry = createToolRegistry([dummyTool("a")]);
  assert.equal(registry.get("missing"), undefined);
});

test("createToolRegistry handles an empty list", () => {
  const registry = createToolRegistry([]);
  assert.equal(registry.size, 0);
});

test("createToolRegistry throws on duplicate tool names", () => {
  assert.throws(
    () => createToolRegistry([dummyTool("a"), dummyTool("a")]),
    /duplicate tool name: a/,
  );
});
