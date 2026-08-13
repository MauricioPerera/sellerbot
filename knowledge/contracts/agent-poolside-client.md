---
type: 'Task Contract'
title: 'Cliente Poolside (OpenAI-compatible)'
description: 'Wrapper delgado sobre el SDK openai apuntado al endpoint OpenAI-compatible de Poolside, con defaults de baseURL y modelo.'
tags: ['ccdd', 'agent', 'poolside']

task: agent_poolside_client
intent: "Construir un cliente de chat streaming contra la API OpenAI-compatible de Poolside, con baseURL y modelo por defecto."
target: src/agent/poolside_client.ts
signature: "function createPoolsideClient(config: PoolsideClientConfig): PoolsideClient"
test_command: "node --test src/agent/poolside_client.test.ts"
budget:
  cyclomatic_max: 4
  nesting_max: 2
tests: "src/agent/poolside_client.test.ts"
tests_sha256: "803e68fa43dc7cc87a827e9147f277058d1eb7f0e45d79180a7d9e254d213155"
touch_only: ['src/agent/poolside_client.ts']
deps_allowed: ['openai']
forbids: ['network', 'subprocess']
---

# Contract: Cliente Poolside (OpenAI-compatible)

## Intent
Punto unico donde se construye el `OpenAI` client apuntando a
`https://inference.poolside.ai/v1` (o a un `baseURL` distinto para uso
self-managed/OpenRouter, ver
[docs.poolside.ai/api/overview](https://docs.poolside.ai/api/overview)).
Es el unico borde de red del agente: el oraculo congelado NO llama
`.streamChat()` (eso dispararia una request real), solo verifica
construccion y defaults — por eso `forbids: network` sigue siendo
verdadero para este test especifico.

## Interface
```typescript
export interface PoolsideClientConfig { baseURL?: string; model?: string; /* + a required string field holding the credential */ }
export interface PoolsideClient {
  config: { baseURL: string; model: string };
  streamChat: (messages, tools) => AsyncIterable<StreamChunk>;
}
function createPoolsideClient(config: PoolsideClientConfig): PoolsideClient
```

## Invariants
- `baseURL` por defecto es `https://inference.poolside.ai/v1`.
- `model` por defecto es `poolside/laguna-s-2.1`.
- Lanza `Error: apiKey is required` si `config.apiKey` esta vacio/ausente.
- `streamChat` nunca se invoca durante la construccion (sin I/O en el
  constructor).

## Examples
- `createPoolsideClient` con solo un `apiKey` de prueba -> `config.baseURL`
  y `config.model` son los defaults.
- `createPoolsideClient` con `apiKey`, `baseURL` y `model` explicitos ->
  usa esos tres valores tal cual, sin defaults.
- `createPoolsideClient({})` -> lanza `Error: apiKey is required`.

## Do / Don't
- DO: usar el paquete npm `openai` tal cual (`deps_allowed: ['openai']`),
  sin reimplementar el cliente HTTP.
- DON'T: llamar `client.streamChat(...)` desde el oraculo congelado — eso
  es responsabilidad de [agent-loop](./agent-agent-loop.md), que recibe la
  funcion de chat inyectada (`ChatFn`) y se testea con un fake, nunca con
  este cliente real.

## Tests
(Los tests estan en `src/agent/poolside_client.test.ts`, oraculo congelado
con `node:test`; solo construccion, cero requests HTTP.)

## Constraints
- `touch_only`: unicamente `src/agent/poolside_client.ts`.
- PARAR y reportar si necesitas conectarte a la red durante el test.
- La API key real (`POOLSIDE_API_KEY`) nunca se hardcodea aca ni en el
  oraculo: siempre viene inyectada por quien construye el cliente
  (ver `src/main.ts`, no contractado, capa de composicion).

## Criterios de aceptacion
- [ ] `node --test src/agent/poolside_client.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
