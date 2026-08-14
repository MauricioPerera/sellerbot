import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import type { OrdersDb } from "../orders/orders_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";
import { evaluateCoupon } from "../coupons/evaluate_coupon.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";

export function confirmPurchaseTool(
  cartDb: CartDb,
  ordersDb: OrdersDb,
  coupons: Coupon[],
  conversationId: string,
): AgentTool {
  return {
    name: "confirm_purchase",
    description:
      "Convert the conversation's cart into a pending_payment order with a pay link, then clear the cart.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    async execute() {
      const cart = cartDb.getCart(conversationId);
      if (cart === null || cart.items.length === 0) {
        return { error: "cart is empty" };
      }

      const summary = summarizeCart(cart);
      if (summary.totalCents === null) {
        return { error: "cart has an item with no price, cannot confirm purchase" };
      }

      let finalTotalCents = summary.totalCents;
      let appliedCoupon: { code: string; discountCents: number } | null = null;

      const code = cartDb.getCouponCode(conversationId);
      if (code !== null) {
        const coupon = coupons.find((c) => c.code === code);
        if (coupon !== undefined) {
          const evaluation = evaluateCoupon(cart, coupon, new Date().toISOString());
          if (evaluation.valid && evaluation.discountCents !== null) {
            const discountCents = evaluation.discountCents;
            finalTotalCents = summary.totalCents - discountCents;
            appliedCoupon = { code: coupon.code, discountCents };
          }
        }
      }

      const order = ordersDb.createOrder(conversationId, cart.items, finalTotalCents, appliedCoupon);
      cartDb.saveCart({ conversationId, items: [], updatedAt: new Date().toISOString() });
      cartDb.setCouponCode(conversationId, null);

      const result: {
        order_id: string;
        pay_url: string;
        total_cents: number;
        discount_cents?: number;
        coupon_code?: string;
      } = {
        order_id: order.id,
        pay_url: "/pay/" + order.payToken,
        total_cents: order.totalCents,
      };
      if (appliedCoupon !== null) {
        result.discount_cents = appliedCoupon.discountCents;
        result.coupon_code = appliedCoupon.code;
      }
      return result;
    },
  };
}

export default confirmPurchaseTool;