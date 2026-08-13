import { accumulateStreamDelta } from "./accumulate_stream_delta.ts";
import type { AccumulatedMessage } from "./accumulate_stream_delta.ts";
import { executeToolCall } from "./execute_tool_call.ts";
import type { ToolRegistry } from "./tool_registry.ts";

export interface StreamChunk {
  choices: Array<{
    delta: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
}

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

export type ChatFn = (
  messages: AgentMessage[],
  tools: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>,
) => AsyncIterable<StreamChunk> | Promise<AsyncIterable<StreamChunk>>;

export interface RunAgentTurnOptions {
  onText?: (chunk: string) => void;
  onToolCall?: (name: string, args: string) => void;
  maxTurns?: number;
}

function toolsToOpenAiSchema(registry: ToolRegistry) {
  return Array.from(registry.values()).map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

async function consumeStream(
  chatFn: ChatFn,
  messages: AgentMessage[],
  registry: ToolRegistry,
  onText?: (chunk: string) => void,
): Promise<AccumulatedMessage> {
  let state: AccumulatedMessage = { content: "", toolCalls: [] };
  const stream = await chatFn(messages, toolsToOpenAiSchema(registry));
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta ?? {};
    state = accumulateStreamDelta(state, delta);
    if (delta.content) onText?.(delta.content);
  }
  return state;
}

export async function runAgentTurn(
  chatFn: ChatFn,
  messages: AgentMessage[],
  registry: ToolRegistry,
  options: RunAgentTurnOptions = {},
): Promise<AgentMessage[]> {
  const maxTurns = options.maxTurns ?? 10;
  let currentMessages = messages;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const state = await consumeStream(chatFn, currentMessages, registry, options.onText);

    const assistantMessage: AgentMessage = {
      role: "assistant",
      content: state.content || null,
      ...(state.toolCalls.length > 0
        ? {
            tool_calls: state.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
            })),
          }
        : {}),
    };
    currentMessages = [...currentMessages, assistantMessage];

    if (state.toolCalls.length === 0) {
      return currentMessages;
    }

    for (const tc of state.toolCalls) {
      options.onToolCall?.(tc.name, tc.arguments);
    }

    const toolResults = await Promise.all(
      state.toolCalls.map((tc) => executeToolCall(tc, registry)),
    );
    currentMessages = [...currentMessages, ...toolResults];
  }

  throw new Error("maxTurns exceeded");
}
