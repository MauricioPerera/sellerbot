// Composition root: cablea el cliente Poolside real, el registro de tools y
// el loop de orquestacion. No es una unidad CCDD-contractada — solo compone
// piezas que ya tienen su propio contrato en knowledge/contracts/agent-*.md.
import readline from "node:readline/promises";
import { createPoolsideClient } from "./poolside_client.ts";
import { createToolRegistry } from "./tool_registry.ts";
import { runAgentTurn } from "./agent_loop.ts";
import type { AgentMessage } from "./agent_loop.ts";
import getTimeTool from "./tools/get_time.ts";

const apiKey = process.env.POOLSIDE_API_KEY;
if (!apiKey) {
  console.error("Missing POOLSIDE_API_KEY environment variable.");
  process.exit(1);
}

const client = createPoolsideClient({ apiKey });
const registry = createToolRegistry([getTimeTool]);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`Connected to ${client.config.model} via ${client.config.baseURL}.`);
console.log("Type a message and press Enter (Ctrl+C to exit).\n");

let messages: AgentMessage[] = [];

while (true) {
  const userInput = await rl.question("> ");
  messages = [...messages, { role: "user", content: userInput }];

  messages = await runAgentTurn(client.streamChat, messages, registry, {
    onText: (chunk) => process.stdout.write(chunk),
  });

  process.stdout.write("\n\n");
}
