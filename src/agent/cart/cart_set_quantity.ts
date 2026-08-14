import type { Cart } from "./cart_db.ts";

export function setCartItemQuantity(cart: Cart, productId: string, quantity: number): Cart {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error(
      `quantity must be a non-negative integer, got ${quantity}`,
    );
  }

  let found = false;
  const items = [];
  for (const existing of cart.items) {
    if (existing.productId === productId) {
      found = true;
      if (quantity > 0) {
        items.push({ ...existing, quantity });
      }
    } else {
      items.push(existing);
    }
  }

  if (!found) {
    throw new Error(`productId not in cart: ${productId}`);
  }

  return {
    conversationId: cart.conversationId,
    items,
    updatedAt: cart.updatedAt,
  };
}