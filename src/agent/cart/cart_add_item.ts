import type { Cart, CartItem } from "./cart_db.ts";

export function addCartItem(cart: Cart, item: CartItem): Cart {
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error(
      `item.quantity must be a positive integer, got ${item.quantity}`,
    );
  }

  const items: CartItem[] = [];
  let merged = false;
  for (const existing of cart.items) {
    if (existing.productId === item.productId) {
      items.push({
        ...item,
        quantity: existing.quantity + item.quantity,
      });
      merged = true;
    } else {
      items.push(existing);
    }
  }

  if (!merged) items.push(item);

  return {
    conversationId: cart.conversationId,
    items,
    updatedAt: cart.updatedAt,
  };
}