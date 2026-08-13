import { test } from "node:test";
import assert from "node:assert/strict";
import calculateTool from "./calculate.ts";

test("calculate tool declares its OpenAI-facing shape", () => {
  const tool = calculateTool();
  assert.equal(tool.name, "calculate");
  assert.equal(typeof tool.description, "string");
  assert.deepEqual(tool.parameters, {
    type: "object",
    properties: { expression: { type: "string" } },
    required: ["expression"],
    additionalProperties: false,
  });
});

test("calculate tool execute() returns the numeric result on success", async () => {
  const tool = calculateTool();
  const result = await tool.execute({ expression: "2 + 3 * 4" });
  assert.deepEqual(result, { result: 14 });
});

test("calculate tool execute() returns a structured error instead of throwing", async () => {
  const tool = calculateTool();
  const result = await tool.execute({ expression: "1 / 0" });
  assert.deepEqual(result, { error: "division by zero" });
});

test("calculate tool execute() rejects a non-string expression", async () => {
  const tool = calculateTool();
  const result = await tool.execute({ expression: 5 });
  assert.deepEqual(result, { error: "expression must be a string" });
});
