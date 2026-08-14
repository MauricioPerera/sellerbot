import type { Cart } from "./cart_db.ts";

export function removeCartItem(cart: Cart, productId: string): Cart {
  return {
    conversationId: cart.conversationId,
    items: cart.items.filter((item) => item.productId !== productId),
    updatedAt: cart.updatedAt,
  };
}