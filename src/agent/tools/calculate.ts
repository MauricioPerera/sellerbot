import type { AgentTool } from "../tool_registry.ts";
import { calculateExpression } from "../calculate_expression.ts";

export function calculateTool(): AgentTool {
  return {
    name: "calculate",
    description: "Evaluate a basic arithmetic expression using +, -, *, / and parentheses.",
    parameters: {
      type: "object",
      properties: { expression: { type: "string" } },
      required: ["expression"],
      additionalProperties: false,
    },
    async execute(args) {
      if (typeof args.expression !== "string") {
        return { error: "expression must be a string" };
      }
      try {
        return { result: calculateExpression(args.expression) };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "invalid expression" };
      }
    },
  };
}

export default calculateTool;
