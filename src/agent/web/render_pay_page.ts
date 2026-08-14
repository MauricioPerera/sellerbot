// Renderer de la pagina mock de pago de una orden. Funcion pura: arma el HTML
// completo a partir de una `Order` ya cargada, sin I/O ni deps externas
// (deps_allowed: []). Mismo espiritu de seguridad que render_markdown.ts:
// TODO texto interpolado se escapa ANTES de insertarse en el HTML -- defensa en
// profundidad aunque los datos vengan del catalogo, no del usuario.

import type { Order, OrderItem } from "../orders/orders_db.ts";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escapa TODO caracter HTML especial del texto. Se aplica ANTES de interpolar:
// un nombre de producto como `<script>` nunca llega como tag al output.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Formatea un monto en centavos como pesos argentinos: coma decimal, punto de
// miles. `13800` -> `"$ 138,00"`, `150000` -> `"$ 1.500,00"`. Trabaja sobre
// enteros para no arrastrar ruido de coma flotante.
function formatArs(cents: number): string {
  const total = Math.round(cents);
  const intPart = Math.floor(total / 100);
  const decPart = total % 100;
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decStr = decPart.toString().padStart(2, "0");
  return `$ ${intStr},${decStr}`;
}

// Una <li> por item: nombre escapado, cantidad y precio unitario en ARS. Si el
// precio unitario es null (item libre/descuento), se muestra un guion.
function renderItem(item: OrderItem): string {
  const name = escapeHtml(item.name);
  const price = item.unitPriceCents === null ? "-" : formatArs(item.unitPriceCents);
  return `<li>${name} &times;${item.quantity} — ${price}</li>`;
}

// Mensaje de resultado en espanol para ordenes ya resueltas. La palabra clave
// (aprobad/rechazad/cancelad) siempre aparece para que el test la encuentre.
function statusMessage(status: Order["status"]): string {
  if (status === "paid") return "Pago aprobado. Gracias por su compra.";
  if (status === "payment_failed") return "Pago rechazado. Intente nuevamente.";
  return "Orden cancelada.";
}

// Dos <form method="post"> para una orden pendiente: uno aprueba, otro rechaza.
// `payToken` es un UUID controlado por el sistema, se interpola directo.
function pendingForms(payToken: string): string {
  return (
    `<form action="/pay/${payToken}/approve" method="post">` +
    `<button type="submit">Aprobar pago</button>` +
    `</form>` +
    `<form action="/pay/${payToken}/reject" method="post">` +
    `<button type="submit">Rechazar pago</button>` +
    `</form>`
  );
}

// HTML completo de la pagina de pago de la orden. Solo pending_payment muestra
// los formularios; los demas estados muestran el mensaje de resultado.
export function renderPayPage(order: Order): string {
  const orderId = escapeHtml(order.id);
  const total = formatArs(order.totalCents);
  const itemsHtml = order.items.map(renderItem).join("");

  const actions =
    order.status === "pending_payment" ? pendingForms(order.payToken) : `<p>${statusMessage(order.status)}</p>`;

  return (
    `<!doctype html>` +
    `<html lang="es">` +
    `<head><meta charset="utf-8"><title>Pago de orden ${orderId}</title></head>` +
    `<body>` +
    `<h1>Orden ${orderId}</h1>` +
    `<p>Total: ${total}</p>` +
    `<ul>${itemsHtml}</ul>` +
    actions +
    `</body>` +
    `</html>`
  );
}