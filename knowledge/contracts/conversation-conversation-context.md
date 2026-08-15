---
type: 'Task Contract'
title: 'Contexto de seguimiento entre sesiones (resume + estado derivado)'
description: 'Deriva el estado conversacional minimo escaneando tool_calls del historial y lo persiste; reconstruye un mensaje de contexto legible para el LLM al reanudar una conversacion.'
tags: ['ccdd', 'conversation', 'orchestration']
language: typescript

task: conversation_conversation_context
intent: "Persistir un resumen re-derivado del historial conversacional, reconstruible como contexto para el LLM al reanudar."
target: src/agent/conversation/conversation_context.ts
signature: "function updateConversationState(allMessages: AgentMessage[], db: ConversationDb, conversationId: string): void"
test_command: "node --test src/agent/conversation/conversation_context.test.ts"
budget:
  cyclomatic_max: 12
  nesting_max: 4
tests: "src/agent/conversation/conversation_context.test.ts"
tests_sha256: "3fd4b859c4dc6be4eb3c00547d3448a7041fc0e27efc5f4a9b1b57753197659f"
touch_only: ['src/agent/conversation/conversation_context.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Contexto de seguimiento entre sesiones

## Intent
Issue #13: este archivo tenia un comentario que lo marcaba como "no es una
unidad CCDD-contractada, es orquestacion" pero contiene logica real (no solo
wiring) usada por AMBOS composition roots (`main.ts` y `server.ts`) para
resolver preguntas de seguimiento ("el segundo", "ese producto") despues de
reiniciar el proceso. Este contrato lo trae al mismo regimen KDD que el resto
del repo: `updateConversationState` re-deriva el estado (ultima busqueda, sus
resultados, ultimo producto visto) escaneando `tool_calls` a
`search_products`/`get_product_detail` en TODO el historial de mensajes de la
conversacion y lo persiste via [conversation_db](./conversation-conversation-db.md);
`buildResumeContext` arma el mensaje de sistema que se le inyecta al LLM al
reanudar. Ninguna de las dos funciones interpreta lenguaje natural: solo
extraen/formatean datos ya estructurados.

## Interface
```typescript
export function updateConversationState(
  allMessages: AgentMessage[],
  db: ConversationDb,
  conversationId: string,
): void

export function describeProduct(catalog: DbProduct[], id: string): string

export function buildResumeContext(
  catalog: DbProduct[],
  state: ConversationState | null,
): string | null
```

## Invariants
- `updateConversationState` SIEMPRE llama `db.saveState(...)` exactamente una
  vez, incluso con `allMessages` vacio (persiste el estado previo sin
  cambios, o nulls/`[]` si no habia estado previo).
- Solo mensajes `role: "assistant"` con `tool_calls` se inspeccionan; mensajes
  `role: "user"`/`"system"`/`"tool"` (excepto como resultado emparejado) y
  mensajes `assistant` sin `tool_calls` se ignoran.
- Un `tool_call` a `search_products`/`get_product_detail` sin un mensaje
  `role: "tool"` con `tool_call_id` coincidente se ignora (no lanza).
- Un resultado de tool cuyo `content` no es JSON parseable se ignora (no
  lanza, no corrompe el resto del scan).
- El historial se re-escanea completo en cada llamada (no incremental): si
  hay varios `tool_calls` a la misma tool, el ULTIMO en `allMessages` gana.
- `buildResumeContext` devuelve `null` cuando `state` es `null` y tambien
  cuando `state` no tiene ninguna parte "contable" (sin query+resultados de
  busqueda Y sin producto visto) — un `lastSearchQuery` con
  `lastSearchResultIds` vacio no cuenta como parte.
- `describeProduct` nunca lanza: id no encontrado en `catalog` -> mensaje de
  fallback en vez de `undefined`/excepcion.

## Examples
- `updateConversationState([], db, "conv-1")` sobre una base vacia -> guarda
  `{ lastSearchQuery: null, lastSearchResultIds: [], lastViewedProductId: null, ... }`.
- Historial con un `tool_call` a `search_products` (`{query: "remeras"}`) y su
  resultado (`{results: [{id: "p1"}, {id: "p2"}]}`) -> guarda
  `lastSearchQuery: "remeras"`, `lastSearchResultIds: ["p1", "p2"]`.
- Dos `tool_calls` a `search_products` en el mismo historial -> se guarda el
  del segundo (el mas reciente), no el primero.
- `buildResumeContext(catalog, null)` -> `null`.
- `buildResumeContext(catalog, state)` con `lastSearchQuery` + resultados no
  vacios -> string que menciona la query y describe cada resultado via
  `describeProduct`.
- `describeProduct(catalog, "id-inexistente")` -> `"id id-inexistente (ya no esta en el catalogo)"`.

## Do / Don't
- DO: tratar cada mensaje `role: "tool"` como el resultado de UN
  `tool_call_id`, emparejando por ese campo (nunca por posicion/indice).
- DO: seguir tratando a `ConversationDb`/`AgentMessage`/`DbProduct` como tipos
  externos ya contractados — este contrato no los modifica.
- DON'T: interpretar lenguaje natural del usuario aca (ej. resolver "el
  segundo" a un id) — eso lo hace el LLM usando el string que devuelve
  `buildResumeContext`.
- DON'T: trackear deltas incrementales del historial; el re-scan completo en
  cada turno es deliberado (barato para una sesion de chat tipica).

## Tests
(Los tests estan en `src/agent/conversation/conversation_context.test.ts`,
oraculo congelado con `node:test`, usando un `ConversationDb` fake en memoria
— este contrato no toca `node:sqlite` directamente.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/conversation/conversation_context.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/conversation/conversation_context.test.ts` sale
      en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
