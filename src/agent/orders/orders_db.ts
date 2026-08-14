export type OrderStatus = "pending_payment" | "paid" | "payment_failed" | "cancelled";
export type PaymentStatus = "pending" | "approved" | "rejected";

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number | null;
}

export interface Order {
  id: string;
  conversationId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalCents: number;
  payToken: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  orderId: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  orderId: string;
  type: string;
  createdAt: string;
}

export interface OrdersDb {
  createOrder(conversationId: string, items: OrderItem[], totalCents: number): Order;
  getOrder(orderId: string): Order | null;
  getOrderByPayToken(payToken: string): Order | null;
  getPayment(orderId: string): Payment | null;
  setPaymentResult(orderId: string, result: "approved" | "rejected"): { order: Order; payment: Payment };
  listEvents(orderId: string): OrderEvent[];
  close(): void;
}

import { DatabaseSync } from "node:sqlite";

function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    conversationId: row.conversationId as string,
    status: row.status as OrderStatus,
    items: JSON.parse(row.items as string) as OrderItem[],
    totalCents: row.totalCents as number,
    payToken: row.payToken as string,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function rowToPayment(row: Record<string, unknown>): Payment {
  return {
    orderId: row.orderId as string,
    status: row.status as PaymentStatus,
    createdAt: row.createdAt as string,
    updatedAt: row.updatedAt as string,
  };
}

function rowToEvent(row: Record<string, unknown>): OrderEvent {
  return {
    orderId: row.orderId as string,
    type: row.type as string,
    createdAt: row.createdAt as string,
  };
}

export function openOrdersDb(location: string): OrdersDb {
  const db = new DatabaseSync(location);
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      status TEXT NOT NULL,
      items TEXT NOT NULL,
      totalCents INTEGER NOT NULL,
      payToken TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      orderId TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orderId TEXT NOT NULL,
      type TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders
      (id, conversationId, status, items, totalCents, payToken, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments
      (orderId, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO order_events
      (orderId, type, createdAt)
    VALUES (?, ?, ?)
  `);
  const getOrderById = db.prepare("SELECT * FROM orders WHERE id = ?");
  const getOrderByToken = db.prepare("SELECT * FROM orders WHERE payToken = ?");
  const getPaymentByOrder = db.prepare("SELECT * FROM payments WHERE orderId = ?");
  const updateOrderStatus = db.prepare(`
    UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?
  `);
  const updatePaymentStatus = db.prepare(`
    UPDATE payments SET status = ?, updatedAt = ? WHERE orderId = ?
  `);
  const listEventsByOrder = db.prepare(`
    SELECT * FROM order_events WHERE orderId = ? ORDER BY id ASC
  `);

  return {
    createOrder(conversationId: string, items: OrderItem[], totalCents: number): Order {
      if (items.length === 0) {
        throw new Error("createOrder: cannot create an order with no items");
      }
      const id = crypto.randomUUID();
      const payToken = crypto.randomUUID();
      const now = new Date().toISOString();
      const order: Order = {
        id,
        conversationId,
        status: "pending_payment",
        items,
        totalCents,
        payToken,
        createdAt: now,
        updatedAt: now,
      };

      db.exec("BEGIN");
      try {
        insertOrder.run(
          order.id,
          order.conversationId,
          order.status,
          JSON.stringify(order.items),
          order.totalCents,
          order.payToken,
          order.createdAt,
          order.updatedAt,
        );
        insertPayment.run(order.id, "pending", now, now);
        insertEvent.run(order.id, "order_created", now);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
      return order;
    },

    getOrder(orderId: string): Order | null {
      const row = getOrderById.get(orderId) as Record<string, unknown> | undefined;
      return row ? rowToOrder(row) : null;
    },

    getOrderByPayToken(payToken: string): Order | null {
      const row = getOrderByToken.get(payToken) as Record<string, unknown> | undefined;
      return row ? rowToOrder(row) : null;
    },

    getPayment(orderId: string): Payment | null {
      const row = getPaymentByOrder.get(orderId) as Record<string, unknown> | undefined;
      return row ? rowToPayment(row) : null;
    },

    setPaymentResult(orderId: string, result: "approved" | "rejected"): { order: Order; payment: Payment } {
      const orderRow = getOrderById.get(orderId) as Record<string, unknown> | undefined;
      if (!orderRow) {
        throw new Error(`setPaymentResult: order ${orderId} does not exist`);
      }
      const paymentRow = getPaymentByOrder.get(orderId) as Record<string, unknown> | undefined;
      if (!paymentRow) {
        throw new Error(`setPaymentResult: payment for order ${orderId} does not exist`);
      }
      const currentPaymentStatus = paymentRow.status as PaymentStatus;
      if (currentPaymentStatus === "approved" || currentPaymentStatus === "rejected") {
        throw new Error(`setPaymentResult: payment for order ${orderId} is already resolved`);
      }

      const newPaymentStatus: PaymentStatus = result;
      const newOrderStatus: OrderStatus = result === "approved" ? "paid" : "payment_failed";
      const eventType = result === "approved" ? "payment_approved" : "payment_rejected";
      const now = new Date().toISOString();

      db.exec("BEGIN");
      try {
        updateOrderStatus.run(newOrderStatus, now, orderId);
        updatePaymentStatus.run(newPaymentStatus, now, orderId);
        insertEvent.run(orderId, eventType, now);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }

      const order = rowToOrder(getOrderById.get(orderId) as Record<string, unknown>);
      const payment = rowToPayment(getPaymentByOrder.get(orderId) as Record<string, unknown>);
      return { order, payment };
    },

    listEvents(orderId: string): OrderEvent[] {
      const rows = listEventsByOrder.all(orderId) as Record<string, unknown>[];
      return rows.map(rowToEvent);
    },

    close(): void {
      db.close();
    },
  };
}