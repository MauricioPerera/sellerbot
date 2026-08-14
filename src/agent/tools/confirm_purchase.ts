import type { AgentTool } from "../tool_registry.ts";
import type { CartDb } from "../cart/cart_db.ts";
import type { OrdersDb } from "../orders/orders_db.ts";
import { summarizeCart } from "../cart/cart_summary.ts";
import type { Coupon } from "../coupons/evaluate_coupon.ts";
import type { PromotionsDb } from "../promotions/promotions_db.ts";
import type { PromotionRule } from "../promotions/evaluate_promotion.ts";
import { combineDiscounts } from "../promotions/combine_discounts.ts";
import type { DbProduct } from "../catalog/catalog_db.ts";

export function confirmPurchaseTool(
  cartDb: CartDb,
  ordersDb: OrdersDb,
  coupons: Coupon[],
  promotionsDb: PromotionsDb,
  catalog: DbProduct[],
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

      const code = cartDb.getCouponCode(conversationId);
      const coupon = code !== null ? coupons.find((c) => c.code === code) ?? null : null;

      const promotionId = cartDb.getPromotionId(conversationId);
      let promotionRule: PromotionRule | null = null;
      let discountPriceCents: number | null = null;
      if (promotionId !== null) {
        const promotion = promotionsDb.getPromotion(promotionId);
        if (promotion !== null && promotion.active === true) {
          promotionRule = promotion;
          const discountProduct = catalog.find((p) => p.id === promotion.discountProductId);
          discountPriceCents = discountProduct === undefined ? null : discountProduct.priceCents;
        }
      }

      const result = combineDiscounts(cart, coupon, promotionRule, discountPriceCents, new Date().toISOString());
      const finalTotalCents = result.finalTotalCents ?? summary.totalCents;

      const order = ordersDb.createOrder(
        conversationId,
        cart.items,
        finalTotalCents,
        result.couponApplicable ? { code: coupon!.code, discountCents: result.couponDiscountCents } : null,
        result.promotionApplicable ? { id: promotionId!, discountCents: result.promotionDiscountCents } : null,
      );
      cartDb.saveCart({ conversationId, items: [], updatedAt: new Date().toISOString() });
      cartDb.setCouponCode(conversationId, null);
      cartDb.setPromotionId(conversationId, null);

      const resultObj: {
        order_id: string;
        pay_url: string;
        total_cents: number;
        discount_cents?: number;
        coupon_code?: string;
        promotion_discount_cents?: number;
        promotion_id?: string;
      } = {
        order_id: order.id,
        pay_url: "/pay/" + order.payToken,
        total_cents: order.totalCents,
      };
      if (result.couponApplicable) {
        resultObj.discount_cents = result.couponDiscountCents;
        resultObj.coupon_code = coupon!.code;
      }
      if (result.promotionApplicable) {
        resultObj.promotion_discount_cents = result.promotionDiscountCents;
        resultObj.promotion_id = promotionId!;
      }
      return resultObj;
    },
  };
}

export default confirmPurchaseTool;