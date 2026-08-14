import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import { evaluateCoupon } from "../coupons/evaluate_coupon.ts";

export function applyCouponTool(
  cartDb: CartDb,
  coupons: Coupon[],
  conversationId: string,
): AgentTool {
  return {
    name: "apply_coupon",
    description:
      "Resolve a coupon code against the coupon dataset, evaluate it against the current cart, and persist it only if valid.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string" },
      },
      required: ["code"],
      additionalProperties: false,
    },
    async execute(args) {
      const code = args.code;
      if (typeof code !== "string") {
        return { error: "code must be a string" };
      }

      const upper = code.toUpperCase();
      const coupon =
        coupons.find((c) => c.code.toUpperCase() === upper) ?? null;

      const cart = cartDb.getCart(conversationId) ?? {
        conversationId,
        items: [],
        updatedAt: new Date().toISOString(),
      };

      const evaluation = evaluateCoupon(cart, coupon, new Date().toISOString());
      if (!evaluation.valid) {
        return { error: evaluation.reason };
      }

      cartDb.setCouponCode(conversationId, upper);
      const subtotalCents = summarizeCart(cart).totalCents as number;
      return {
        code: upper,
        discount_cents: evaluation.discountCents,
        subtotal_cents: subtotalCents,
        total_cents: subtotalCents - (evaluation.discountCents as number),
      };
    },
  };
}

export default applyCouponTool;