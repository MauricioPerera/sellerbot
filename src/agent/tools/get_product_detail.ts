import type { AgentTool } from "../tool_registry.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";
import { getProductDetail } from "../catalog/get_product_detail.ts";

export function getProductDetailTool(products: DbProduct[]): AgentTool {
  return {
    name: "get_product_detail",
    description: "Get the full detail (product + variations) for a single product by id.",
    parameters: {
      type: "object",
      properties: { product_id: { type: "string" } },
      required: ["product_id"],
      additionalProperties: false,
    },
    async execute(args) {
      if (typeof args.product_id !== "string") {
        return { error: "product_id must be a string" };
      }
      const detail = getProductDetail(products, args.product_id);
      if (detail === null) {
        return { error: `no product found with id ${args.product_id}` };
      }
      return detail;
    },
  };
}

export default getProductDetailTool;