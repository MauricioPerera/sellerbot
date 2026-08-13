# sellerbot

Agente de chat con tool-calling, construido en TypeScript desde cero (sin frameworks de agentes), contra la API OpenAI-compatible de [Poolside](https://docs.poolside.ai/api/overview).

Este repo **no es** una plantilla de metodología — es un proyecto real que se construyó **siguiendo** la metodología [KDD (Knowledge-Driven Development)](knowledge/index.md): cada pieza del agente es un [task contract](knowledge/contracts/) con oráculo de tests congelado (`tests_sha256`) y verificado por gates deterministas antes de darse por terminada.

## Qué hace

- Loop de chat streaming contra `poolside/laguna-s-2.1` (u otro modelo compatible), con reconstrucción manual de `tool_calls` fragmentados durante el stream.
- Dos tools de ejemplo:
  - `get_time` — hora UTC actual en ISO 8601.
  - `calculate` — evalúa expresiones aritméticas (`+ - * / ()`) con un parser recursive-descent propio, **sin `eval`/`new Function`**.
- Visibilidad de qué tool se disparó (`[tool: nombre(args)]`) impresa en la terminal.

## Quickstart

```bash
npm install
cp .env.example .env   # pegá tu POOLSIDE_API_KEY en .env (nunca en .env.example, ese se commitea)
npm test                # tests, node:test nativo, sin dependencias de testing
npm run import-catalog   # carga el catalogo dummy en data/catalog.sqlite (idempotente)
npm start                # agente interactivo en la terminal
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
  agent_loop.ts                # orquesta turnos: stream -> tool_calls -> repite hasta respuesta final
  tools/
    get_time.ts
    calculate.ts
  catalog/
    parse_woocommerce_csv.ts    # parser CSV RFC4180 a mano (sin deps)
    normalize_product_row.ts    # fila CSV cruda -> producto normalizado (tipo, precio en centavos)
    catalog_db.ts                # persistencia SQLite (node:sqlite nativo)
    import_catalog.ts            # orquesta parse+normalize+insert, idempotente
    import_catalog_cli.ts        # composition root: corre el import real (no CCDD-contractado)
  main.ts                      # composition root: CLI, cablea todo lo anterior (no CCDD-contractado)
```

Cada archivo salvo `main.ts` e `import_catalog_cli.ts` tiene su contrato en [`knowledge/contracts/agent-*.md`](knowledge/contracts/) y [`knowledge/contracts/catalog-*.md`](knowledge/contracts/), con oráculo de tests propio y `touch_only` acotado a ese único archivo.

## Catálogo (dummy WooCommerce)

`data/woocommerce-sample-data.csv` es un snapshot local versionado (ver [`data/README.md`](data/README.md)) — el import nunca depende de que una URL externa siga viva o sin cambios.

```bash
npm run import-catalog   # crea/actualiza data/catalog.sqlite; correrlo de nuevo no duplica nada
rm data/catalog.sqlite   # reset: borra la base local (gitignored, se regenera con el import)
npm run import-catalog   # recarga limpia para una demo
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
