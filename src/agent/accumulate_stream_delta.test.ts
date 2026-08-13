import { test } from "node:test";
import assert from "node:assert/strict";
import { accumulateStreamDelta } from "./accumulate_stream_delta.ts";
import type { AccumulatedMessage } from "./accumulate_stream_delta.ts";

const empty: AccumulatedMessage = { content: "", toolCalls: [] };

test("accumulateStreamDelta concatenates text content across chunks", () => {
  let state = accumulateStreamDelta(empty, { content: "Hel" });
  state = accumulateStreamDelta(state, { content: "lo" });
  assert.equal(state.content, "Hello");
  assert.deepEqual(state.toolCalls, []);
});

test("accumulateStreamDelta handles a delta with no content and no tool_calls", () => {
  const state = accumulateStreamDelta(empty, {});
  assert.deepEqual(state, { content: "", toolCalls: [] });
});

test("accumulateStreamDelta merges fragmented tool_call deltas by index", () => {
  let state = accumulateStreamDelta(empty, {
    tool_calls: [{ index: 0, id: "call_1", function: { name: "get_time", arguments: "" } }],
  });
  state = accumulateStreamDelta(state, {
    tool_calls: [{ index: 0, function: { arguments: '{"a":' } }],
  });
  state = accumulateStreamDelta(state, {
    tool_calls: [{ index: 0, function: { arguments: "1}" } }],
  });
  assert.equal(state.toolCalls.length, 1);
  assert.deepEqual(state.toolCalls[0], {
    id: "call_1",
    name: "get_time",
    arguments: '{"a":1}',
  });
});

test("accumulateStreamDelta tracks multiple concurrent tool calls by index", () => {
  let state = accumulateStreamDelta(empty, {
    tool_calls: [
      { index: 0, id: "call_1", function: { name: "a", arguments: "" } },
      { index: 1, id: "call_2", function: { name: "b", arguments: "" } },
    ],
  });
  state = accumulateStreamDelta(state, {
    tool_calls: [{ index: 1, function: { arguments: "{}" } }],
  });
  assert.equal(state.toolCalls.length, 2);
  assert.equal(state.toolCalls[0]?.name, "a");
  assert.equal(state.toolCalls[1]?.arguments, "{}");
});
