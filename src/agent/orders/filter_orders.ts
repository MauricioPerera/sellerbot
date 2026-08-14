import type { Order, OrderStatus } from "./orders_db.ts";

export interface OrderFilters {
  status?: OrderStatus;
  id?: string;
  dateFrom?: string;
  dateTo?: string;
}

function matches(order: Order, filters: OrderFilters): boolean {
  if (filters.status !== undefined && order.status !== filters.status) return false;
  if (filters.id !== undefined && !order.id.toLowerCase().includes(filters.id.toLowerCase())) return false;
  if (filters.dateFrom !== undefined && order.createdAt < filters.dateFrom) return false;
  if (filters.dateTo !== undefined && order.createdAt > filters.dateTo) return false;
  return true;
}

export function filterOrders(orders: Order[], filters: OrderFilters): Order[] {
  return orders.filter((order) => matches(order, filters));
}