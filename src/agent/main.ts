// Composition root: cablea el cliente Poolside real, el registro de tools y
// el loop de orquestacion. No es una unidad CCDD-contractada — solo compone
// piezas que ya tienen su propio contrato en knowledge/contracts/agent-*.md.
import readline from "node:readline/promises";
import { createPoolsideClient } from "./poolside_client.ts";
import { createToolRegistry } from "./tool_registry.ts";
import { runAgentTurn } from "./agent_loop.ts";
import type { AgentMessage } from "./agent_loop.ts";
import getTimeTool from "./tools/get_time.ts";
import calculateTool from "./tools/calculate.ts";
import searchProductsTool from "./tools/search_products.ts";
import getProductDetailTool from "./tools/get_product_detail.ts";
import { openCatalogDb } from "./catalog/catalog_db.ts";

const apiKey = process.env.POOLSIDE_API_KEY;
if (!apiKey) {
  console.error("Missing POOLSIDE_API_KEY environment variable.");
  process.exit(1);
}

const catalogDb = openCatalogDb("data/catalog.sqlite");
const catalog = catalogDb.listProducts();
catalogDb.close();
if (catalog.length === 0) {
  console.warn("Catalog is empty. Run `npm run import-catalog` first for product search to work.\n");
}

const client = createPoolsideClient({ apiKey });
const registry = createToolRegistry([
  getTimeTool(),
  calculateTool(),
  searchProductsTool(catalog),
  getProductDetailTool(catalog),
]);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(`Connected to ${client.config.model} via ${client.config.baseURL}.`);
console.log("Type a message and press Enter (Ctrl+C to exit).\n");

let messages: AgentMessage[] = [
  {
    role: "system",
    content:
      "Always call the calculate tool for arithmetic instead of computing it yourself, even for simple expressions. Always call the get_time tool when asked for the current time instead of guessing it. When asked about products, always call search_products first and never invent a product, price, or attribute that isn't in its results; call get_product_detail with a result's id to answer follow-up questions about a specific product or its variations.",
  },
];

while (true) {
  let userInput: string;
  try {
    userInput = await rl.question("> ");
  } catch {
    // Input closed (EOF/piped stdin ended): exit the loop cleanly instead
    // of crashing on ERR_USE_AFTER_CLOSE.
    break;
  }

  messages = [...messages, { role: "user", content: userInput }];

  messages = await runAgentTurn(client.streamChat, messages, registry, {
    onText: (chunk) => process.stdout.write(chunk),
    onToolCall: (name, args) => process.stdout.write(`\n[tool: ${name}(${args})]\n`),
  });

  process.stdout.write("\n\n");
}

process.stdout.write("Bye.\n");
