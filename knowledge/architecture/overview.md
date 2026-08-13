---
type: 'Architecture'
title: 'Arquitectura general'
description: 'Arquitectura real de sellerbot: agente CLI con tool-calling contra la API OpenAI-compatible de Poolside.'
tags: ['architecture', 'overview', 'sellerbot', 'poolside', 'agent', 'cli']
---

# Arquitectura general (sellerbot)

Vista de alto nivel de **sellerbot**, un agente de chat CLI en TypeScript con tool-calling
contra la API OpenAI-compatible de Poolside. El formato de este nodo se define en
[OKF-SPEC](../OKF-SPEC.md).

## Componentes

1. **`src/agent/main.ts`** — composition root / CLI. Ejecuta un loop de `readline` que lee
   el input del usuario y dispara cada turno del agente.
2. **`src/agent/poolside_client.ts`** — wrapper del SDK npm `openai` apuntado a
   `https://inference.poolside.ai/v1` (API OpenAI-compatible de Poolside). Abstrae la
   conexión con el modelo.
3. **`src/agent/agent_loop.ts` (`runAgentTurn`)** — orquesta un turno: llama al cliente en
   modo streaming y, cuando el modelo emite `tool_calls`, los ejecuta y vuelve a llamar hasta
   obtener una respuesta final de texto.
4. **`src/agent/accumulate_stream_delta.ts`** — reconstruye texto y `tool_calls` fragmentados
   chunk a chunk durante el streaming (los `tool_calls` llegan fragmentados por índice, no
   completos).
5. **`src/agent/execute_tool_call.ts`** — despacha un `tool_call` acumulado contra el registro
   de tools y ejecuta la tool correspondiente.
6. **`src/agent/tool_registry.ts`** — indexa las tools disponibles (`Map` por nombre).
7. **`src/agent/tools/get_time.ts`** y **`src/agent/tools/calculate.ts`** — las dos tools
   concretas. `calculate.ts` envuelve `src/agent/calculate_expression.ts`, un parser aritmético
   recursive-descent escrito a mano (sin `eval` / `new Function`).

## Relaciones

```text
Usuario --(stdin / readline)--> main.ts --(runAgentTurn)--> agent_loop.ts
agent_loop.ts --(streaming)--> poolside_client.ts --(HTTPS)--> inference.poolside.ai/v1
agent_loop.ts --(tool_calls acumulados)--> accumulate_stream_delta.ts
agent_loop.ts --(por tool_call)--> execute_tool_call.ts --(lookup)--> tool_registry.ts
execute_tool_call.ts --(dispatch)--> tools/get_time.ts | tools/calculate.ts
calculate.ts --(evalúa)--> calculate_expression.ts
```

- `main.ts` → `agent_loop.ts`: un `runAgentTurn` por línea de input del usuario.
- `agent_loop.ts` → `poolside_client.ts`: llamada en modo streaming a la API de Poolside.
- `agent_loop.ts` → `accumulate_stream_delta.ts`: reconstrucción de texto y `tool_calls` a
  partir de los deltas del stream.
- `agent_loop.ts` → `execute_tool_call.ts`: ejecución de cada `tool_call` acumulado.
- `execute_tool_call.ts` → `tool_registry.ts`: resolución del nombre de tool a su handler.
- `execute_tool_call.ts` → `tools/*`: invocación de la tool concreta.

## Decisiones clave

- **API OpenAI-compatible:** Poolside expone `https://inference.poolside.ai/v1`, por lo que se
  reutiliza el SDK npm `openai` en lugar de un cliente propio.
- **Streaming con acumulación de deltas:** el modelo transmite texto y `tool_calls` en chunks;
  `accumulate_stream_delta.ts` los reensambla porque los `tool_calls` llegan fragmentados por
  índice y no completos en un solo chunk.
- **Loop de tool-calling:** `runAgentTurn` repite llamada → ejecución de tools → llamada hasta
  que el modelo responde con texto final, sin tool_calls pendientes.
- **Parser aritmético a mano:** `calculate_expression.ts` usa recursive-descent en lugar de
  `eval` / `new Function`, evitando ejecución arbitraria de código.

## Límites de esta vista

No cubre despliegue, observabilidad ni configuración de entorno. Los contratos deterministas
de cada componente (salvo `main.ts`) viven en `knowledge/contracts/agent-*.md`.