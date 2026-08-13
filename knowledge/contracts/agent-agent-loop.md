---
type: 'Task Contract'
title: 'Loop de orquestacion del agente'
description: 'Consume un stream de chat, acumula deltas, ejecuta tool_calls y repite hasta una respuesta final sin tool_calls, con limite de turnos.'
tags: ['ccdd', 'agent', 'poolside', 'streaming']
language: typescript

task: agent_agent_loop
intent: "Orquestar turnos de chat con tool-calling hasta obtener una respuesta final, con la funcion de chat inyectada."
target: src/agent/agent_loop.ts
signature: "async function runAgentTurn(chatFn: ChatFn, messages: AgentMessage[], registry: ToolRegistry, options?: RunAgentTurnOptions): Promise<AgentMessage[]>"
test_command: "node --test src/agent/agent_loop.test.ts"
budget:
  cyclomatic_max: 8
  nesting_max: 3
tests: "src/agent/agent_loop.test.ts"
tests_sha256: "69966d86ea7f25417796dd3abfc53b147ac9e5aaac493df94d0bc9f48249bdfa"
touch_only: ['src/agent/agent_loop.ts']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: Loop de orquestacion del agente

## Intent
El corazon del agente: reemplaza lo que un framework como `eve` te da
"gratis" (el loop de tool-calling durante streaming). Depende SOLO de
[accumulate-stream-delta](./agent-accumulate-stream-delta.md) y
[execute-tool-call](./agent-execute-tool-call.md), nunca del cliente HTTP
real — `chatFn` se inyecta, por eso el oraculo puede testear el loop
completo (incluida la recursion multi-turno con tool_calls) sin tocar la
red ni el SDK de `openai`.

## Interface
```typescript
export type ChatFn = (messages: AgentMessage[], tools: OpenAiToolSchema[]) => AsyncIterable<StreamChunk>;
export interface RunAgentTurnOptions {
  onText?: (chunk: string) => void;
  onToolCall?: (name: string, args: string) => void;
  maxTurns?: number;
}
async function runAgentTurn(
  chatFn: ChatFn,
  messages: AgentMessage[],
  registry: ToolRegistry,
  options?: RunAgentTurnOptions,
): Promise<AgentMessage[]>
```

## Invariants
- Si el stream no produce `tool_calls`, devuelve `messages` + un mensaje
  `assistant` final; nunca vuelve a llamar `chatFn`.
- Si el stream produce `tool_calls`, ejecuta cada uno
  ([execute-tool-call](./agent-execute-tool-call.md)), los agrega como
  mensajes `role: "tool"` y vuelve a llamar `chatFn` con el historial
  extendido.
- `onText` se invoca con cada fragmento de texto no vacio, en orden, antes
  de que termine el turno.
- `onToolCall` se invoca una vez por cada tool_call acumulado (nombre +
  `arguments` crudo, string JSON sin parsear), justo antes de ejecutarlo
  ([execute-tool-call](./agent-execute-tool-call.md)) — visibilidad para
  quien consume el loop (ej. `main.ts` logueando qué tool se disparo),
  sin acoplar la orquestacion a como se muestra esa informacion.
- Nunca entra en loop infinito: a partir de `maxTurns` (default 10) lanza
  `Error: maxTurns exceeded`.

## Examples
- Stream de solo texto ("Hel" + "lo") -> devuelve 2 mensajes
  (`user`, `assistant` con `content: "Hello"`); `onText` acumula "Hello".
- Stream con un `tool_call` a `echo` -> ejecuta la tool, agrega el
  resultado como mensaje `tool`, llama `chatFn` una segunda vez, y el
  resultado final incluye un mensaje `assistant` con la respuesta del
  segundo turno.
- Tool que siempre devuelve otro `tool_call` (`loop`), con
  `maxTurns: 2` -> lanza `Error: maxTurns exceeded`.
- Stream con un `tool_call` a `echo` y `arguments: '{"text":"hi"}'` ->
  `onToolCall` se llama una vez con `("echo", '{"text":"hi"}')`.

## Do / Don't
- DO: recibir `chatFn` como dependencia inyectada (para poder testear sin
  red real — ver [poolside-client](./agent-poolside-client.md) para la
  implementacion real que se inyecta en produccion).
- DON'T: importar `openai` o el cliente Poolside en este archivo.

## Tests
(Los tests estan en `src/agent/agent_loop.test.ts`, oraculo congelado con
`node:test`, usando un `ChatFn` fake que devuelve async generators fijos
en memoria.)

## Constraints
- Sin red, sin subprocess (`forbids`).
- `touch_only`: unicamente `src/agent/agent_loop.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/agent_loop.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
