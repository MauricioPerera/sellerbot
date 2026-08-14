import type { PromotionRule } from "./evaluate_promotion.ts";
import { DatabaseSync } from "node:sqlite";

export interface Promotion extends PromotionRule {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionInput {
  triggerProductId: string;
  discountProductId: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  combinableWithCoupons: boolean;
}

export interface PromotionsDb {
  createPromotion(input: CreatePromotionInput): Promotion;
  getPromotion(id: string): Promotion | null;
  listPromotions(): Promotion[];
  setActive(id: string, active: boolean): Promotion;
  deletePromotion(id: string): void;
  close(): void;
}

function rowToPromotion(row: Record<string, unknown>): Promotion {
  return {
    id: row.id as string,
    triggerProductId: row.triggerProductId as string,
    discountProductId: row.discountProductId as string,
    discountType: row.discountType as "percentage" | "fixed",
    discountValue: row.discountValue as number,
    combinableWithCoupons: Boolean(row.combinableWithCoupons),
    active: Boolean(row.active),
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

export function openPromotionsDb(location: string): PromotionsDb {
  const db = new DatabaseSync(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS promotions (
      id TEXT PRIMARY KEY,
      triggerProductId TEXT NOT NULL,
      discountProductId TEXT NOT NULL,
      discountType TEXT NOT NULL,
      discountValue INTEGER NOT NULL,
      combinableWithCoupons INTEGER NOT NULL,
      active INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  const insertPromotion = db.prepare(`
    INSERT INTO promotions
      (id, triggerProductId, discountProductId, discountType, discountValue, combinableWithCoupons, active, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getPromotionById = db.prepare("SELECT * FROM promotions WHERE id = ?");
  const updateActive = db.prepare(`
    UPDATE promotions SET active = ?, updatedAt = ? WHERE id = ?
  `);
  const deletePromotionById = db.prepare("DELETE FROM promotions WHERE id = ?");
  const listAllPromotions = db.prepare(`
    SELECT * FROM promotions ORDER BY createdAt DESC, rowid DESC
  `);

  return {
    createPromotion(input: CreatePromotionInput): Promotion {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const promotion: Promotion = {
        id,
        triggerProductId: input.triggerProductId,
        discountProductId: input.discountProductId,
        discountType: input.discountType,
        discountValue: input.discountValue,
        combinableWithCoupons: input.combinableWithCoupons,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      insertPromotion.run(
        promotion.id,
        promotion.triggerProductId,
        promotion.discountProductId,
        promotion.discountType,
        promotion.discountValue,
        promotion.combinableWithCoupons ? 1 : 0,
        promotion.active ? 1 : 0,
        promotion.createdAt,
        promotion.updatedAt,
      );
      return promotion;
    },

    getPromotion(id: string): Promotion | null {
      const row = getPromotionById.get(id) as Record<string, unknown> | undefined;
      return row ? rowToPromotion(row) : null;
    },

    listPromotions(): Promotion[] {
      const rows = listAllPromotions.all() as Record<string, unknown>[];
      return rows.map(rowToPromotion);
    },

    setActive(id: string, active: boolean): Promotion {
      const row = getPromotionById.get(id) as Record<string, unknown> | undefined;
      if (!row) {
        throw new Error(`setActive: promotion ${id} does not exist`);
      }
      const now = new Date().toISOString();
      updateActive.run(active ? 1 : 0, now, id);
      return rowToPromotion(getPromotionById.get(id) as Record<string, unknown>);
    },

    deletePromotion(id: string): void {
      deletePromotionById.run(id);
    },

    close(): void {
      db.close();
    },
  };
}

export default openPromotionsDb;