import type { AgentTool } from "../tool_registry.ts";

export function getTimeTool(): AgentTool {
  return {
    name: "get_time",
    description: "Return the current UTC time in ISO 8601 format.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      return { iso: new Date().toISOString() };
    },
  };
}

export default getTimeTool;
