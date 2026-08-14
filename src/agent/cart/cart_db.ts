export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
}

export interface Cart {
  conversationId: string;
  items: CartItem[];
  updatedAt: string;
}

export interface CartDb {
  getCart(conversationId: string): Cart | null;
  saveCart(cart: Cart): void;
  close(): void;
}

import { DatabaseSync } from "node:sqlite";

function rowToCart(row: Record<string, unknown>): Cart {
  return {
    conversationId: row.conversationId as string,
    items: JSON.parse(row.items as string) as CartItem[],
    updatedAt: row.updatedAt as string,
  };
}

export function openCartDb(location: string): CartDb {
  const db = new DatabaseSync(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS carts (
      conversationId TEXT PRIMARY KEY,
      items TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO carts
      (conversationId, items, updatedAt)
    VALUES (?, ?, ?)
  `);
  const getById = db.prepare("SELECT * FROM carts WHERE conversationId = ?");

  return {
    saveCart(cart: Cart): void {
      upsert.run(
        cart.conversationId,
        JSON.stringify(cart.items),
        cart.updatedAt,
      );
    },
    getCart(conversationId: string): Cart | null {
      const row = getById.get(conversationId) as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      return rowToCart(row);
    },
    close(): void {
      db.close();
    },
  };
}