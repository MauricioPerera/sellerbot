import { test } from "node:test";
import assert from "node:assert/strict";
import { executeToolCall } from "./execute_tool_call.ts";
import { createToolRegistry } from "./tool_registry.ts";
import type { AgentTool } from "./tool_registry.ts";

const echoTool: AgentTool = {
  name: "echo",
  description: "Echoes its input back.",
  parameters: { type: "object", properties: { text: { type: "string" } } },
  execute: async (args) => ({ echoed: args.text }),
};

test("executeToolCall runs the matching tool and JSON-encodes the result", async () => {
  const registry = createToolRegistry([echoTool]);
  const result = await executeToolCall(
    { id: "call_1", name: "echo", arguments: '{"text":"hi"}' },
    registry,
  );
  assert.equal(result.role, "tool");
  assert.equal(result.tool_call_id, "call_1");
  assert.equal(result.content, JSON.stringify({ echoed: "hi" }));
});

test("executeToolCall treats empty arguments as an empty object", async () => {
  const registry = createToolRegistry([echoTool]);
  const result = await executeToolCall(
    { id: "call_2", name: "echo", arguments: "" },
    registry,
  );
  assert.equal(result.content, JSON.stringify({ echoed: undefined }));
});

test("executeToolCall returns a structured error for an unknown tool", async () => {
  const registry = createToolRegistry([echoTool]);
  const result = await executeToolCall(
    { id: "call_3", name: "missing", arguments: "{}" },
    registry,
  );
  assert.equal(result.tool_call_id, "call_3");
  assert.deepEqual(JSON.parse(result.content), { error: "unknown tool: missing" });
});

test("executeToolCall returns a structured error for invalid JSON arguments", async () => {
  const registry = createToolRegistry([echoTool]);
  const result = await executeToolCall(
    { id: "call_4", name: "echo", arguments: "{not-json" },
    registry,
  );
  assert.deepEqual(JSON.parse(result.content), { error: "invalid JSON arguments" });
});
