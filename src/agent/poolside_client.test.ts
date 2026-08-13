import { test } from "node:test";
import assert from "node:assert/strict";
import { createPoolsideClient } from "./poolside_client.ts";

// No network calls: only construction and default-config behavior are
// asserted. `.streamChat()` is never invoked here, so no real HTTP request
// happens as part of this frozen oracle.

test("createPoolsideClient defaults baseURL and model when omitted", () => {
  const client = createPoolsideClient({ apiKey: "test-key" });
  assert.equal(typeof client.streamChat, "function");
  assert.equal(client.config.baseURL, "https://inference.poolside.ai/v1");
  assert.equal(client.config.model, "poolside/laguna-s-2.1");
});

test("createPoolsideClient honors an explicit baseURL and model", () => {
  const client = createPoolsideClient({
    apiKey: "test-key",
    baseURL: "https://self-managed.example.com/v1",
    model: "poolside/laguna-xs-2",
  });
  assert.equal(client.config.baseURL, "https://self-managed.example.com/v1");
  assert.equal(client.config.model, "poolside/laguna-xs-2");
});

test("createPoolsideClient throws when apiKey is missing", () => {
  assert.throws(
    // @ts-expect-error deliberately omitting the required field
    () => createPoolsideClient({}),
    /apiKey is required/,
  );
});
