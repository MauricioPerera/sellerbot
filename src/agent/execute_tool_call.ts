import type { AccumulatedToolCall } from "./accumulate_stream_delta.ts";
import type { ToolRegistry } from "./tool_registry.ts";

export interface ToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export async function executeToolCall(
  toolCall: AccumulatedToolCall,
  registry: ToolRegistry,
): Promise<ToolResultMessage> {
  const tool = registry.get(toolCall.name);
  if (!tool) {
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `unknown tool: ${toolCall.name}` }),
    };
  }

  let args: Record<string, unknown>;
  try {
    args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
  } catch {
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: "invalid JSON arguments" }),
    };
  }

  const result = await tool.execute(args);
  return { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) };
}
