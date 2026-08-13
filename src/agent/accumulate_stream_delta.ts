export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface AccumulatedMessage {
  content: string;
  toolCalls: AccumulatedToolCall[];
}

export interface StreamToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

export interface StreamDelta {
  content?: string | null;
  tool_calls?: StreamToolCallDelta[];
}

export function accumulateStreamDelta(
  state: AccumulatedMessage,
  delta: StreamDelta,
): AccumulatedMessage {
  const content = state.content + (delta.content ?? "");
  const toolCalls = [...state.toolCalls];

  for (const tc of delta.tool_calls ?? []) {
    const existing = toolCalls[tc.index] ?? { id: "", name: "", arguments: "" };
    toolCalls[tc.index] = {
      id: tc.id ?? existing.id,
      name: existing.name + (tc.function?.name ?? ""),
      arguments: existing.arguments + (tc.function?.arguments ?? ""),
    };
  }

  return { content, toolCalls };
}
