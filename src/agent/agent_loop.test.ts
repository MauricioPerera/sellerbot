import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgentTurn } from "./agent_loop.ts";
import { createToolRegistry } from "./tool_registry.ts";
import type { AgentTool } from "./tool_registry.ts";
import type { ChatFn, StreamChunk } from "./agent_loop.ts";

async function* toStream(chunks: StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) yield chunk;
}

const textOnlyChunks: StreamChunk[] = [
  { choices: [{ delta: { content: "Hel" } }] },
  { choices: [{ delta: { content: "lo" } }] },
  { choices: [{ delta: {}, finish_reason: "stop" }] },
];

test("runAgentTurn returns the final assistant message when no tools are called", async () => {
  const chatFn: ChatFn = () => toStream(textOnlyChunks);
  const registry = createToolRegistry([]);
  const received: string[] = [];

  const messages = await runAgentTurn(chatFn, [{ role: "user", content: "hi" }], registry, {
    onText: (chunk) => received.push(chunk),
  });

  assert.equal(received.join(""), "Hello");
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.role, "assistant");
  assert.equal(messages[1]?.content, "Hello");
});

test("runAgentTurn executes a tool call and feeds the result back for a second turn", async () => {
  let call = 0;
  const chatFn: ChatFn = () => {
    call += 1;
    if (call === 1) {
      return toStream([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "call_1", function: { name: "echo", arguments: "" } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: '{"text":"hi"}' } }] } },
          ],
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]);
    }
    return toStream([
      { choices: [{ delta: { content: "done" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);
  };

  const echoTool: AgentTool = {
    name: "echo",
    description: "Echoes input.",
    parameters: { type: "object", properties: { text: { type: "string" } } },
    execute: async (args) => ({ echoed: args.text }),
  };
  const registry = createToolRegistry([echoTool]);

  const messages = await runAgentTurn(chatFn, [{ role: "user", content: "echo hi" }], registry);

  assert.equal(call, 2);
  const toolMessage = messages.find((m) => m.role === "tool");
  assert.equal(toolMessage?.content, JSON.stringify({ echoed: "hi" }));
  assert.equal(messages.at(-1)?.role, "assistant");
  assert.equal(messages.at(-1)?.content, "done");
});

test("runAgentTurn invokes onToolCall with the tool name and raw arguments", async () => {
  let call = 0;
  const chatFn: ChatFn = () => {
    call += 1;
    if (call === 1) {
      return toStream([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: "call_1", function: { name: "echo", arguments: "" } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            { delta: { tool_calls: [{ index: 0, function: { arguments: '{"text":"hi"}' } }] } },
          ],
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]);
    }
    return toStream([
      { choices: [{ delta: { content: "done" } }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);
  };

  const echoTool: AgentTool = {
    name: "echo",
    description: "Echoes input.",
    parameters: { type: "object", properties: { text: { type: "string" } } },
    execute: async (args) => ({ echoed: args.text }),
  };
  const registry = createToolRegistry([echoTool]);
  const calls: Array<{ name: string; args: string }> = [];

  await runAgentTurn(chatFn, [{ role: "user", content: "echo hi" }], registry, {
    onToolCall: (name, args) => calls.push({ name, args }),
  });

  assert.deepEqual(calls, [{ name: "echo", args: '{"text":"hi"}' }]);
});

test("runAgentTurn stops after maxTurns to avoid an infinite tool-call loop", async () => {
  const chatFn: ChatFn = () =>
    toStream([
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, id: "call_x", function: { name: "loop", arguments: "{}" } }],
            },
          },
        ],
      },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]);

  const loopTool: AgentTool = {
    name: "loop",
    description: "Always requests itself again.",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ again: true }),
  };
  const registry = createToolRegistry([loopTool]);

  await assert.rejects(
    () => runAgentTurn(chatFn, [{ role: "user", content: "go" }], registry, { maxTurns: 2 }),
    /maxTurns exceeded/,
  );
});
