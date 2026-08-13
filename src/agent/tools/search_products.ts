import type { AgentTool } from "../tool_registry.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import { searchProducts } from "../catalog/search_products.ts";

export function searchProductsTool(products: DbProduct[]): AgentTool {
  return {
    name: "search_products",
    description: "Search the product catalog by query and return ranked matches.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    async execute(args) {
      if (typeof args.query !== "string") {
        return { error: "query must be a string" };
      }
      return { results: searchProducts(products, args.query) };
    },
  };
}

export default searchProductsTool;