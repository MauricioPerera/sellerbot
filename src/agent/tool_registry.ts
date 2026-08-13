export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export type ToolRegistry = Map<string, AgentTool>;

export function createToolRegistry(tools: AgentTool[]): ToolRegistry {
  const registry: ToolRegistry = new Map();
  for (const tool of tools) {
    if (registry.has(tool.name)) {
      throw new Error(`duplicate tool name: ${tool.name}`);
    }
    registry.set(tool.name, tool);
  }
  return registry;
}
