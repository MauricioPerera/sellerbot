# sellerbot

Agente de chat con tool-calling, construido en TypeScript desde cero (sin frameworks de agentes), contra la API OpenAI-compatible de [Poolside](https://docs.poolside.ai/api/overview).

Este repo **no es** una plantilla de metodología — es un proyecto real que se construyó **siguiendo** la metodología [KDD (Knowledge-Driven Development)](knowledge/index.md): cada pieza del agente es un [task contract](knowledge/contracts/) con oráculo de tests congelado (`tests_sha256`) y verificado por gates deterministas antes de darse por terminada.

## Qué hace

- Loop de chat streaming contra `poolside/laguna-s-2.1` (u otro modelo compatible), con reconstrucción manual de `tool_calls` fragmentados durante el stream.
- Tools: `get_time` (hora UTC actual), `calculate` (aritmética con un parser recursive-descent propio, **sin `eval`/`new Function`**), `search_products`/`get_product_detail` (catálogo), `add_to_cart`/`remove_from_cart`/`update_cart_quantity`/`view_cart` (carrito conversacional por sesión), `confirm_purchase`/`check_order_status` (checkout con pasarela de pago **simulada**).
- Visibilidad de qué tool se disparó (`[tool: nombre(args)]`) impresa en la terminal.

## Quickstart

```bash
npm install
cp .env.example .env   # pegá tu POOLSIDE_API_KEY en .env (nunca en .env.example, ese se commitea)
npm test                # tests, node:test nativo, sin dependencias de testing
npm run import-catalog   # carga el catalogo dummy en data/catalog.sqlite (idempotente)
npm start                # agente interactivo en la terminal
npm run web               # UI de chat web en http://localhost:3000
```

Requiere Node 24+ (usa `--env-file-if-exists` y type-stripping nativo de TypeScript; no hay paso de build).

## Arquitectura

```
src/agent/
  tool_registry.ts            # indexa tools por nombre
  accumulate_stream_delta.ts  # reconstruye texto/tool_calls fragmentados del stream
  execute_tool_call.ts        # despacha un tool_call al registro, nunca lanza
  poolside_client.ts          # wrapper del SDK openai contra el endpoint de Poolside
  calculate_expression.ts     # parser aritmético puro (grammar recursive-descent)
  agent_loop.ts               # orquesta turnos: stream -> tool_calls -> repite hasta respuesta final
  tools/
    get_time.ts / calculate.ts
    search_products.ts / get_product_detail.ts       # wrappers sobre catalog/*
    add_to_cart.ts / remove_from_cart.ts / update_cart_quantity.ts / view_cart.ts
    confirm_purchase.ts / check_order_status.ts       # checkout
  catalog/
    parse_woocommerce_csv.ts    # parser CSV RFC4180 a mano (sin deps)
    normalize_product_row.ts    # fila CSV cruda -> producto normalizado (tipo, precio en centavos)
    catalog_db.ts               # persistencia SQLite (node:sqlite nativo)
    search_products.ts / get_product_detail.ts  # busqueda/detalle, puros
    import_catalog.ts           # orquesta parse+normalize+insert, idempotente
    import_catalog_cli.ts       # composition root: corre el import real (no CCDD-contractado)
  conversation/
    conversation_db.ts          # ultima busqueda/producto visto por conversationId (sobrevive reinicio)
    conversation_context.ts     # helpers compartidos por main.ts/server.ts (no CCDD-contractado)
  cart/
    cart_db.ts                                  # persistencia del carrito por conversationId
    cart_add_item.ts / cart_remove_item.ts / cart_set_quantity.ts / cart_summary.ts  # operaciones puras
  orders/
    orders_db.ts                # ordenes/pagos/eventos, maquina de estados (ver seccion Carrito y checkout)
    filter_orders.ts            # filtro puro por estado/id/fecha para el dashboard admin
  web/
    server.ts                   # composition root: servidor HTTP (no CCDD-contractado)
    render_markdown.ts          # markdown -> HTML seguro contra XSS
    render_pay_page.ts          # HTML de la pagina mock de pago
    public/                     # frontend estatico (HTML/CSS/JS sin build): chat + /admin
  main.ts                      # composition root: CLI, cablea todo lo anterior (no CCDD-contractado)
```

Cada archivo salvo los explícitamente marcados "no CCDD-contractado" tiene su contrato en [`knowledge/contracts/`](knowledge/contracts/) (`agent-*`, `catalog-*`, `cart-*`, `orders-*`, `web-*`), con oráculo de tests propio y `touch_only` acotado a ese único archivo.

## Catálogo (dummy WooCommerce)

`data/woocommerce-sample-data.csv` es un snapshot local versionado (ver [`data/README.md`](data/README.md)) — el import nunca depende de que una URL externa siga viva o sin cambios.

```bash
npm run import-catalog   # crea/actualiza data/catalog.sqlite; correrlo de nuevo no duplica nada
rm data/catalog.sqlite   # reset: borra la base local (gitignored, se regenera con el import)
npm run import-catalog   # recarga limpia para una demo
```

## Carrito y checkout (pasarela de pago simulada)

Flujo conversacional completo: buscar/elegir producto -> `add_to_cart` -> ajustar
con `update_cart_quantity`/`remove_from_cart` -> `view_cart` para revisar ->
confirmación **explícita** del usuario ("confirmar compra") -> `confirm_purchase`
crea una orden `pending_payment` con un pay link único y vacía el carrito.

- Moneda única: **ARS**, guardada siempre en centavos enteros; el agente la
  muestra formateada (`$ 1.234,56`), nunca los centavos crudos.
- El pay link (`/pay/<token>`) abre una página mock (sin datos financieros
  reales) con botones **Aprobar pago** / **Rechazar pago**; una vez resuelto
  el pago, la página no permite volver a decidir (ni la API: reintentar
  aprobar/rechazar un pago ya resuelto devuelve `409`).
- El agente nunca inventa el resultado de un pago: usa `check_order_status`
  para consultar el estado real persistido en `data/orders.sqlite`
  (`pending_payment` / `paid` / `payment_failed`).
- Todo queda trazable: orden, pago y cada transición de estado con su
  timestamp se guardan en SQLite (`orders`, `payments`, `order_events`).

```bash
rm -f data/cart.sqlite data/orders.sqlite   # reset: carrito/órdenes de demo (gitignored)
```

## Cupones de descuento

El dataset de cupones (`WELCOME10`, `AHORRA500`, `HOODIE15`, `VERANO2025`)
vive en `src/agent/coupons/coupons_data.ts` y está documentado en
[`data/README.md`](data/README.md#cupones-srcagentcouponscoupons_datats). El
agente aplica un código con `apply_coupon` (o lo remueve con
`remove_coupon`) sobre el carrito de la conversación.

- Eligibilidad determinista, no generada por el modelo: `evaluate_coupon.ts`
  valida vigencia, mínimo de compra e ítems/variaciones aplicables; el
  agente solo comunica el resultado, nunca inventa un descuento ni un motivo
  de rechazo.
- Un cupón inválido o no elegible devuelve el motivo exacto
  (`coupon not found`, `coupon expired`, `cart below minimum purchase`,
  etc.) **sin** modificar el carrito.
- `view_cart` muestra el descuento y el total final mientras el cupón siga
  vigente; si el carrito cambia y el cupón deja de aplicar (ítem elegible
  removido, mínimo de compra roto), se ignora en silencio — el carrito no
  queda en un estado inconsistente ni el agente reporta un error.
- `confirm_purchase` **re-evalúa** el cupón al momento de confirmar (nunca
  confía en un descuento calculado antes) y persiste el snapshot final en la
  orden: `couponCode`/`discountCents` en `data/orders.sqlite`, junto con el
  `totalCents` ya descontado. Una confirmación exitosa limpia el cupón de la
  conversación.
- Un cupón puede coexistir con una promoción vinculada aplicada (ver
  abajo); el campo `appliesToPromotionalItems` de cada cupón decide si su
  descuento también alcanza al producto que trajo la promoción.

## Promociones vinculadas entre productos

Reglas del tipo "si tenés el producto A en el carrito, el producto B tiene
descuento" (ej. "con este hoodie, el segundo con 50% off"). A diferencia de
los cupones (dataset fijo en código), las reglas viven en
`data/promotions.sqlite` vía `src/agent/promotions/promotions_db.ts` — un
CRUD real pensado para un panel administrativo (crear/desactivar/borrar
reglas en runtime, no hardcodeadas).

- **Nunca se aplican solas.** `check_promotions` es de solo lectura: el
  agente la llama después de agregar un producto al carrito para ver si
  desbloqueó una promoción, y se lo comunica al usuario — pero no toca el
  carrito. Solo `apply_promotion` (llamada con el `promotion_id` sugerido,
  **tras confirmación explícita del usuario**) agrega el producto con
  descuento; el agente tiene prohibido llamarla sin esa confirmación.
- `evaluate_promotion.ts` es el motor puro: dado el carrito y una regla,
  decide si el producto disparador está presente y calcula el descuento
  sobre el precio del producto B resuelto en el catálogo — nunca inventado
  por el modelo.
- **Interacción con cupones**: si hay un cupón Y una promoción aplicados a
  la vez, `combine_discounts.ts` los combina. El campo
  `appliesToPromotionalItems` del cupón decide si su descuento también
  alcanza al producto promocionado; si contradice el `combinableWithCoupons`
  de la regla, **gana el cupón** (decisión explícita del producto).
- `view_cart` y `confirm_purchase` usan la misma función de combinación, así
  que el total que se muestra antes de confirmar y el que queda persistido
  en la orden son siempre consistentes.
- `confirm_purchase` re-evalúa la promoción al momento de confirmar (mismo
  criterio de auto-sanación que los cupones: una promoción desactivada
  entre que se sugirió y que se confirma se ignora en silencio) y persiste
  el snapshot final en la orden: `promotionId`/`promotionDiscountCents` en
  `data/orders.sqlite`. Una confirmación exitosa limpia la promoción
  aplicada de la conversación (no remueve el producto del carrito, solo
  detiene el descuento futuro).
- `remove_promotion` quita el descuento sin sacar el producto agregado
  (usar `remove_from_cart` aparte si también se quiere sacar el ítem).

```bash
rm -f data/promotions.sqlite   # reset: reglas de promoción de demo (gitignored)
```

## Dashboard administrativo

`/admin` (servido por el mismo proceso de `npm run web`) es un panel local de
solo-lectura-y-transiciones para gestionar pedidos, **sin autenticación**
(decisión explícita del MVP: un único administrador local, actor fijo
`local-admin` en el log de auditoría).

- Lee y actualiza la MISMA base que el flujo de pagos (`data/orders.sqlite`),
  sin estado paralelo — el listado sale de `OrdersDb.listOrders()`, filtrado
  en memoria por estado/id/rango de fecha (`orders/filter_orders.ts`).
- El detalle de cada orden muestra el historial completo de eventos
  (`order_created`, `payment_approved`/`payment_rejected`, y las
  transiciones manuales) con actor, fecha, estado anterior/nuevo y motivo.
- Transiciones administrativas permitidas: `paid -> shipped` y
  `paid | pending_payment -> cancelled`. `shipped` es un estado simulado
  (sin dirección, transportista ni integración logística real).
- La validación vive en la capa de dominio (`OrdersDb.adminTransition`), no
  en la UI: invocar la API de transición directamente con un estado inválido
  (ej. `shipped` sobre una orden `pending_payment`) devuelve `409` igual que
  si se intentara desde el panel.

```bash
npm run web
# abrir http://localhost:3000/admin
```

## Interfaz web

`npm run web` levanta un servidor HTTP (módulo nativo `http`, sin Express) en `http://localhost:3000` (o `$PORT`) que reusa exactamente el mismo `runAgentTurn` + tools + persistencia que la CLI — es la misma sesión de agente, solo con otro front.

- Frontend estático servido por el propio proceso (`src/agent/web/public/`): HTML/CSS/JS sin build ni framework.
- Cada turno del chat es una respuesta JSON única (no streaming al navegador); el texto del modelo se renderiza con `src/agent/web/render_markdown.ts` — un parser de markdown mínimo, hecho a mano, que escapa todo el HTML antes de aplicar cualquier transformación (headings, negrita, itálica, código, links e imágenes con whitelist de esquema `http(s)://`/`/`).
- El `conversationId` se genera y persiste en `localStorage` del navegador, así que recargar la página conserva el historial (misma base `data/conversations.sqlite` que usa la CLI).

```bash
npm run web
# abrir http://localhost:3000
```

## Metodología

El desarrollo siguió disciplina KDD/CCDD de punta a punta: primero el contrato + tests congelados, después la implementación contra ese oráculo, y validación en dos niveles antes de dar cualquier pieza por terminada:

- **Nivel 1** (obligatorio): `python scripts/validate_contracts.py knowledge/contracts` — estructura del contrato, sello `tests_sha256`, perímetro `touch_only`.
- **Nivel 2** (gate real de complejidad/integración vía MCP `ccdd-complexity`): `lint_task_contract` + `run_integration_gate` sobre el export de `scripts/export_gate_contract.py`.

El [`CHANGELOG.md`](CHANGELOG.md) de este repo registra el tooling/infraestructura KDD vendorizada (los gates, no el producto) — los cambios de sellerbot en sí viven en el historial de git.

La referencia completa de la metodología (no específica de este proyecto) vive en [`knowledge/index.md`](knowledge/index.md) y [`.agents/AGENTS.md`](.agents/AGENTS.md) — léelos si vas a agregar una tool nueva o tocar el loop del agente; cualquier cambio a `src/agent/*.ts` (salvo `main.ts`) debe pasar por un contrato antes de implementarse.

## Seguridad

- `.env` nunca se commitea (gitignored). `.env.example` es la plantilla trackeada — **nunca pegues una key real ahí**.
- `calculate_expression.ts` evalúa aritmética sin `eval`/`new Function`: el input llega del modelo/usuario final, así que no hay superficie de ejecución de código arbitrario.
