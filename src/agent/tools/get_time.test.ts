import { test } from "node:test";
import assert from "node:assert/strict";
import getTimeTool from "./get_time.ts";

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

test("get_time tool declares its OpenAI-facing shape", () => {
  assert.equal(getTimeTool.name, "get_time");
  assert.equal(typeof getTimeTool.description, "string");
  assert.deepEqual(getTimeTool.parameters, {
    type: "object",
    properties: {},
    additionalProperties: false,
  });
});

test("get_time tool execute() returns the current time as ISO 8601", async () => {
  const result = (await getTimeTool.execute({})) as { iso: string };
  assert.match(result.iso, ISO_8601);
  assert.equal(new Date(result.iso).toISOString(), result.iso);
});
