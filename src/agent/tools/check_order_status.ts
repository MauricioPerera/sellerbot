import type { AgentTool } from "../tool_registry.ts";
import type { OrdersDb } from "../orders/orders_db.ts";

export function checkOrderStatusTool(ordersDb: OrdersDb): AgentTool {
  return {
    name: "check_order_status",
    description: "Query the current status of an order by id to confirm the real result of a payment.",
    parameters: {
      type: "object",
      properties: { order_id: { type: "string" } },
      required: ["order_id"],
      additionalProperties: false,
    },
    async execute(args) {
      if (typeof args.order_id !== "string") {
        return { error: "order_id must be a string" };
      }
      const order = ordersDb.getOrder(args.order_id);
      if (order === null) {
        return { error: `no order found with id ${args.order_id}` };
      }
      return {
        order_id: order.id,
        status: order.status,
        total_cents: order.totalCents,
      };
    },
  };
}

export default checkOrderStatusTool;