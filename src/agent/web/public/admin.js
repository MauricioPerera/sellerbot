const STATUS_LABELS = {
  pending_payment: "Pendiente de pago",
  paid: "Pagada",
  payment_failed: "Pago fallido",
  shipped: "Enviada",
  cancelled: "Cancelada",
};

function formatArs(cents) {
  const total = Math.round(cents);
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const intPart = Math.floor(abs / 100);
  const decPart = abs % 100;
  const intStr = intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decStr = decPart.toString().padStart(2, "0");
  return `${sign}$ ${intStr},${decStr}`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("es-AR");
}

function currentFilters() {
  const params = new URLSearchParams();
  const status = document.getElementById("f-status").value;
  const id = document.getElementById("f-id").value.trim();
  const from = document.getElementById("f-from").value;
  const to = document.getElementById("f-to").value;
  if (status) params.set("status", status);
  if (id) params.set("id", id);
  if (from) params.set("dateFrom", new Date(from).toISOString());
  if (to) params.set("dateTo", new Date(to + "T23:59:59.999Z").toISOString());
  return params;
}

async function loadOrders() {
  const params = currentFilters();
  const res = await fetch(`/admin/api/orders?${params.toString()}`);
  const data = await res.json();
  renderOrders(data.orders ?? []);
}

function renderOrders(orders) {
  const body = document.getElementById("orders-body");
  const empty = document.getElementById("orders-empty");
  body.innerHTML = "";
  empty.hidden = orders.length > 0;

  for (const order of orders) {
    const tr = document.createElement("tr");
    tr.dataset.orderId = order.id;
    const itemsSummary = order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ");
    tr.innerHTML = `
      <td>${order.id.slice(0, 8)}…</td>
      <td>${formatDate(order.createdAt)}</td>
      <td>${itemsSummary}</td>
      <td>${formatArs(order.totalCents)}</td>
      <td><span class="status-pill status-${order.status}">${STATUS_LABELS[order.status] ?? order.status}</span></td>
    `;
    tr.addEventListener("click", () => openDetail(order.id));
    body.appendChild(tr);
  }
}

async function openDetail(orderId) {
  const res = await fetch(`/admin/api/orders/${orderId}`);
  if (!res.ok) return;
  const data = await res.json();
  renderDetail(data.order, data.events);
  document.getElementById("detail-panel").hidden = false;
}

function renderDetail(order, events) {
  const canShip = order.status === "paid";
  const canCancel = order.status === "paid" || order.status === "pending_payment";

  const itemsHtml = order.items.map((i) => `<li>${i.name} ×${i.quantity} — ${formatArs(i.unitPriceCents ?? 0)}</li>`).join("");
  const eventsHtml = events
    .map((e) => {
      const who = e.actor ? `por ${e.actor}` : "sistema";
      const reason = e.reason ? ` — "${e.reason}"` : "";
      return `<li>${formatDate(e.createdAt)}: ${e.type} (${who})${reason}</li>`;
    })
    .join("");

  document.getElementById("detail-content").innerHTML = `
    <h2>Orden ${order.id}</h2>
    <p><span class="status-pill status-${order.status}">${STATUS_LABELS[order.status] ?? order.status}</span></p>
    <p>Total: ${formatArs(order.totalCents)}</p>
    <ul>${itemsHtml}</ul>
    <h3>Historial</h3>
    <ul class="events">${eventsHtml}</ul>
    <div class="actions">
      <button type="button" id="btn-ship" ${canShip ? "" : "disabled"}>Marcar enviada</button>
      <button type="button" id="btn-cancel" ${canCancel ? "" : "disabled"}>Cancelar</button>
    </div>
    <textarea id="reason" placeholder="Motivo (opcional)" rows="2"></textarea>
    <p id="action-error" style="color:#e8747a"></p>
  `;

  document.getElementById("btn-ship")?.addEventListener("click", () => transition(order.id, "shipped"));
  document.getElementById("btn-cancel")?.addEventListener("click", () => transition(order.id, "cancelled"));
}

async function transition(orderId, toStatus) {
  const reason = document.getElementById("reason").value.trim();
  const res = await fetch(`/admin/api/orders/${orderId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStatus, reason: reason || undefined }),
  });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById("action-error").textContent = data.error ?? "No se pudo aplicar la transición.";
    return;
  }
  await openDetail(orderId);
  await loadOrders();
}

document.getElementById("filters").addEventListener("submit", (e) => {
  e.preventDefault();
  loadOrders();
});

document.getElementById("detail-close").addEventListener("click", () => {
  document.getElementById("detail-panel").hidden = true;
});

// --- Promociones (issue #10) ---------------------------------------------

async function loadPromotions() {
  const res = await fetch("/admin/api/promotions");
  const data = await res.json();
  renderPromotions(data.promotions ?? []);
}

function renderPromotions(promotions) {
  const body = document.getElementById("promotions-body");
  const empty = document.getElementById("promotions-empty");
  body.innerHTML = "";
  empty.hidden = promotions.length > 0;

  for (const p of promotions) {
    const tr = document.createElement("tr");
    tr.dataset.promotionId = p.id;
    const valueLabel = p.discountType === "percentage" ? `${p.discountValue}%` : formatArs(p.discountValue);
    tr.innerHTML = `
      <td>${p.triggerProductId}</td>
      <td>${p.discountProductId}</td>
      <td>${valueLabel}${p.combinableWithCoupons ? " <span class=\"promo-tag\">+cupones</span>" : ""}</td>
      <td><span class="status-pill ${p.active ? "status-active" : "status-inactive"}">${p.active ? "Activa" : "Inactiva"}</span></td>
      <td class="promo-actions"></td>
    `;
    const actions = tr.querySelector(".promo-actions");
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.textContent = p.active ? "Desactivar" : "Activar";
    toggleBtn.addEventListener("click", () => togglePromotion(p.id, !p.active));
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Borrar";
    deleteBtn.addEventListener("click", () => deletePromotion(p.id));
    actions.append(toggleBtn, deleteBtn);
    body.appendChild(tr);
  }
}

async function createPromotion(formData) {
  const errorEl = document.getElementById("promotion-error");
  const res = await fetch("/admin/api/promotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData),
  });
  const data = await res.json();
  if (!res.ok) {
    errorEl.textContent = data.error ?? "No se pudo crear la promoción.";
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;
  document.getElementById("promotion-form").reset();
  await loadPromotions();
}

async function togglePromotion(id, active) {
  const res = await fetch(`/admin/api/promotions/${id}/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errorEl = document.getElementById("promotion-error");
    errorEl.textContent = data.error ?? "No se pudo cambiar el estado.";
    errorEl.hidden = false;
    return;
  }
  await loadPromotions();
}

async function deletePromotion(id) {
  const res = await fetch(`/admin/api/promotions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const errorEl = document.getElementById("promotion-error");
    errorEl.textContent = data.error ?? "No se pudo borrar la promoción.";
    errorEl.hidden = false;
    return;
  }
  await loadPromotions();
}

document.getElementById("promotion-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const formData = {
    triggerProductId: document.getElementById("p-trigger").value.trim(),
    discountProductId: document.getElementById("p-discount").value.trim(),
    discountType: document.getElementById("p-type").value,
    discountValue: Number(document.getElementById("p-value").value),
    combinableWithCoupons: document.getElementById("p-combinable").checked,
  };
  createPromotion(formData);
});

loadOrders();
loadPromotions();
