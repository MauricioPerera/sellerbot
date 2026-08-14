import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";
import { evaluateCoupon } from "../coupons/evaluate_coupon.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";

export function viewCartTool(
  cartDb: CartDb,
  coupons: Coupon[],
  conversationId: string,
): AgentTool {
  return {
    name: "view_cart",
    description: "Show the current contents of the shopping cart (items, subtotals and total).",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const cart = cartDb.getCart(conversationId);
      if (cart === null) {
        return { items: [], totalCents: 0 };
      }

      const summary = summarizeCart(cart);

      const code = cartDb.getCouponCode(conversationId);
      if (code === null) {
        return summary;
      }

      const coupon = coupons.find((c) => c.code === code);
      if (coupon === undefined) {
        return summary;
      }

      const evaluation = evaluateCoupon(cart, coupon, new Date().toISOString());
      if (!evaluation.valid || evaluation.discountCents === null) {
        return summary;
      }

      const discountCents = evaluation.discountCents;
      const finalTotalCents =
        summary.totalCents === null ? null : summary.totalCents - discountCents;

      return {
        ...summary,
        couponCode: code,
        discountCents,
        finalTotalCents,
      };
    },
  };
}

export default viewCartTool;