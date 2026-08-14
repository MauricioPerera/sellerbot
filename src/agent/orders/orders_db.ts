export type OrderStatus = "pending_payment" | "paid" | "payment_failed" | "shipped" | "cancelled";
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
  couponCode: string | null;
  discountCents: number;
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
  actor: string | null;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  reason: string | null;
  createdAt: string;
}

export interface OrdersDb {
  createOrder(
    conversationId: string,
    items: OrderItem[],
    totalCents: number,
    coupon?: { code: string; discountCents: number } | null,
  ): Order;
  getOrder(orderId: string): Order | null;
  getOrderByPayToken(payToken: string): Order | null;
  getPayment(orderId: string): Payment | null;
  setPaymentResult(orderId: string, result: "approved" | "rejected"): { order: Order; payment: Payment };
  listEvents(orderId: string): OrderEvent[];
  listOrders(): Order[];
  adminTransition(orderId: string, toStatus: "shipped" | "cancelled", actor: string, reason?: string): Order;
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
    couponCode: (row.couponCode ?? null) as string | null,
    discountCents: (row.discountCents ?? 0) as number,
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
    actor: (row.actor ?? null) as string | null,
    fromStatus: (row.fromStatus ?? null) as OrderStatus | null,
    toStatus: (row.toStatus ?? null) as OrderStatus | null,
    reason: (row.reason ?? null) as string | null,
    createdAt: row.createdAt as string,
  };
}

function assertCanAdminTransition(currentStatus: OrderStatus, toStatus: "shipped" | "cancelled"): void {
  if (toStatus === "shipped") {
    if (currentStatus !== "paid") {
      throw new Error(`adminTransition: cannot ship an order in status ${currentStatus}`);
    }
  } else if (currentStatus !== "paid" && currentStatus !== "pending_payment") {
    throw new Error(`adminTransition: cannot cancel an order in status ${currentStatus}`);
  }
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
      couponCode TEXT,
      discountCents INTEGER,
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
      actor TEXT,
      fromStatus TEXT,
      toStatus TEXT,
      reason TEXT,
      createdAt TEXT NOT NULL
    );
  `);

  // Migrate older order_events tables (pre-issue #5) that lack the audit columns.
  const eventCols = db.prepare("PRAGMA table_info(order_events)").all() as { name: string }[];
  const eventColNames = new Set(eventCols.map((c) => c.name));
  for (const col of ["actor", "fromStatus", "toStatus", "reason"]) {
    if (!eventColNames.has(col)) {
      db.exec(`ALTER TABLE order_events ADD COLUMN ${col} TEXT`);
    }
  }

  // Migrate older orders tables (pre-issue #6) that lack the coupon snapshot columns.
  const orderCols = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  const orderColNames = new Set(orderCols.map((c) => c.name));
  for (const [col, type] of [["couponCode", "TEXT"], ["discountCents", "INTEGER"]] as const) {
    if (!orderColNames.has(col)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${type}`);
    }
  }

  const insertOrder = db.prepare(`
    INSERT INTO orders
      (id, conversationId, status, items, totalCents, couponCode, discountCents, payToken, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPayment = db.prepare(`
    INSERT INTO payments
      (orderId, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO order_events
      (orderId, type, actor, fromStatus, toStatus, reason, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
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
  const listAllOrders = db.prepare(`
    SELECT * FROM orders ORDER BY createdAt DESC, rowid DESC
  `);

  return {
    createOrder(
      conversationId: string,
      items: OrderItem[],
      totalCents: number,
      coupon?: { code: string; discountCents: number } | null,
    ): Order {
      if (items.length === 0) {
        throw new Error("createOrder: cannot create an order with no items");
      }
      const id = crypto.randomUUID();
      const payToken = crypto.randomUUID();
      const now = new Date().toISOString();
      const couponCode = coupon?.code ?? null;
      const discountCents = coupon?.discountCents ?? 0;
      const order: Order = {
        id,
        conversationId,
        status: "pending_payment",
        items,
        totalCents,
        couponCode,
        discountCents,
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
          order.couponCode,
          order.discountCents,
          order.payToken,
          order.createdAt,
          order.updatedAt,
        );
        insertPayment.run(order.id, "pending", now, now);
        insertEvent.run(order.id, "order_created", null, null, "pending_payment", null, now);
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
        insertEvent.run(orderId, eventType, null, "pending_payment", newOrderStatus, null, now);
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

    listOrders(): Order[] {
      const rows = listAllOrders.all() as Record<string, unknown>[];
      return rows.map(rowToOrder);
    },

    adminTransition(orderId: string, toStatus: "shipped" | "cancelled", actor: string, reason?: string): Order {
      const orderRow = getOrderById.get(orderId) as Record<string, unknown> | undefined;
      if (!orderRow) {
        throw new Error(`adminTransition: order ${orderId} does not exist`);
      }
      const currentStatus = orderRow.status as OrderStatus;
      assertCanAdminTransition(currentStatus, toStatus);

      const now = new Date().toISOString();
      db.exec("BEGIN");
      try {
        updateOrderStatus.run(toStatus, now, orderId);
        insertEvent.run(orderId, "admin_transition", actor, currentStatus, toStatus, reason ?? null, now);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }

      return rowToOrder(getOrderById.get(orderId) as Record<string, unknown>);
    },

    close(): void {
      db.close();
    },
  };
}