export interface DbProduct {
  id: string;
  sku: string;
  name: string;
  type: "simple" | "variable" | "variation";
  description: string;
  priceCents: number | null;
  categories: string[];
  images: string[];
  parentId: string | null;
  attributes: Array<{ name: string; value: string }>;
}

export interface CatalogDb {
  insertProduct(product: DbProduct): void;
  getProductById(id: string): DbProduct | null;
  listProducts(): DbProduct[];
  close(): void;
}

import { DatabaseSync } from "node:sqlite";

function rowToProduct(row: Record<string, unknown>): DbProduct {
  return {
    id: row.id as string,
    sku: row.sku as string,
    name: row.name as string,
    type: row.type as DbProduct["type"],
    description: row.description as string,
    priceCents: row.price as number | null,
    categories: JSON.parse(row.categories as string) as string[],
    images: JSON.parse(row.images as string) as string[],
    parentId: row.parentId as string | null,
    attributes: JSON.parse(row.attributes as string) as DbProduct["attributes"],
  };
}

export function openCatalogDb(location: string): CatalogDb {
  const db = new DatabaseSync(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL,
      categories TEXT NOT NULL,
      images TEXT NOT NULL,
      parentId TEXT,
      attributes TEXT NOT NULL
    )
  `);

  const insert = db.prepare(`
    INSERT INTO products
      (id, sku, name, type, description, price, categories, images, parentId, attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const getById = db.prepare("SELECT * FROM products WHERE id = ?");
  const listAll = db.prepare("SELECT * FROM products");

  return {
    insertProduct(product: DbProduct): void {
      if (product.priceCents !== null && !Number.isInteger(product.priceCents)) {
        throw new Error("priceCents must be an integer");
      }
      insert.run(
        product.id,
        product.sku,
        product.name,
        product.type,
        product.description,
        product.priceCents,
        JSON.stringify(product.categories),
        JSON.stringify(product.images),
        product.parentId,
        JSON.stringify(product.attributes),
      );
    },
    getProductById(id: string): DbProduct | null {
      const row = getById.get(id) as Record<string, unknown> | undefined;
      if (row === undefined) return null;
      return rowToProduct(row);
    },
    listProducts(): DbProduct[] {
      const rows = listAll.all() as Array<Record<string, unknown>>;
      return rows.map(rowToProduct);
    },
    close(): void {
      db.close();
    },
  };
}
