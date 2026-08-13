---
type: 'Task Contract'
title: 'Renderer de markdown minimo (seguro contra XSS)'
description: 'Convierte un subconjunto minimo de markdown (headings, bold, italic, code, links, imagenes, listas, parrafos) a HTML escapado, sin libreria externa.'
tags: ['ccdd', 'web', 'markdown', 'security']
language: typescript

task: web_render_markdown
intent: "Convertir un subconjunto minimo de markdown a HTML escapado."
target: src/agent/web/render_markdown.ts
signature: "function renderMarkdown(input: string): string"
test_command: "node --test src/agent/web/render_markdown.test.ts"
budget:
  cyclomatic_max: 16
  nesting_max: 4
tests: "src/agent/web/render_markdown.test.ts"
tests_sha256: "7ad4abd24b3d59698700ba1903ff485dbc1c28ffeff9cc8a501c7255af27f61e"
touch_only: ['src/agent/web/render_markdown.ts']
deps_allowed: []
forbids: ['network', 'subprocess', 'llm']
---

# Contract: Renderer de markdown minimo

## Intent
Issue #3: la UI web necesita mostrar las respuestas del modelo con formato
(parrafos, negrita, enlaces, imagenes de producto) en vez de texto plano. El
texto de entrada es SIEMPRE output del LLM — que a su vez puede reflejar
input del usuario — asi que esto es una superficie de XSS real si se
inyecta como HTML sin escapar. Parser a mano (sin libreria markdown de
npm), mismo espiritu que `calculate_expression.ts` y
`parse_woocommerce_csv.ts`: control total sobre que se ejecuta.

## Interface
```typescript
function renderMarkdown(input: string): string
```

## Invariants
- TODO caracter HTML especial (`<`, `>`, `&`, `"`, `'`) del texto de entrada
  se escapa ANTES de aplicar cualquier transformacion de markdown — texto
  como `<script>` nunca aparece sin escapar en el output.
- Bloques separados por una o mas lineas en blanco se procesan cada uno por
  separado, concatenados sin separador entre tags.
- DENTRO de un bloque (ya separado por lineas en blanco), el bloque se
  subdivide ADEMAS por transiciones de tipo de linea sin necesitar una
  linea en blanco: una linea `#`/`##`/`###` (heading) es SIEMPRE su propio
  elemento; una corrida de lineas consecutivas que empiezan con `- ` es
  SIEMPRE su propia `<ul>`; el resto de lineas consecutivas (ni heading ni
  `- `) forman un `<p>`. Ejemplo: `"Detalle:\n- SKU: X\n- Precio: Y"` (una
  sola linea en blanco NO las separa) produce `<p>Detalle:</p><ul>...</ul>`,
  no un unico `<p>` con guiones literales.
- `# texto` -> `<h1>texto</h1>`; `## texto` -> `<h2>texto</h2>`;
  `### texto` -> `<h3>texto</h3>` (con transformaciones inline aplicadas al
  contenido del heading igual que en un parrafo).
- Un bloque cuyas lineas empiezan TODAS con `- ` (sin heading ni texto
  suelto) se renderiza como `<ul><li>...</li>...</ul>` (una `<li>` por
  linea, sin el prefijo `- `).
- Inline: `**texto**` -> `<strong>texto</strong>`; `*texto*` -> `<em>texto</em>`;
  `` `texto` `` -> `<code>texto</code>`.
- Inline: `[texto](url)` -> `<a href="url" target="_blank" rel="noopener noreferrer">texto</a>`
  SOLO si `url` empieza con `http://`, `https://` o `/`; cualquier otro
  esquema (`javascript:`, `data:`, etc.) hace que el link NO se convierta —
  el texto crudo (ya escapado) queda tal cual, sin `<a>`.
  `![alt](url)` sigue la misma regla de esquema permitido, generando
  `<img src="url" alt="alt" loading="lazy">` o quedando como texto plano si
  el esquema no es seguro.
- Input vacio (`""`) devuelve `""`.

## Examples
- `"Hello world"` -> `"<p>Hello world</p>"`.
- `"<script>alert(1)</script>"` -> el output NO contiene `<script>` literal
  (esta escapado como `&lt;script&gt;`).
- `"**bold**"` -> `"<p><strong>bold</strong></p>"`.
- `"[click me](javascript:alert(1))"` -> el output NO contiene `<a `.
- `"- A\n- B"` -> `"<ul><li>A</li><li>B</li></ul>"`.
- `"## Abominable Hoodie"` -> `"<h2>Abominable Hoodie</h2>"`.
- `"### Details:\n- SKU: MH09\n- Price: $69.00"` -> 
  `"<h3>Details:</h3><ul><li>SKU: MH09</li><li>Price: $69.00</li></ul>"`
  (heading y lista separados sin necesitar linea en blanco entre ellos).

## Do / Don't
- DO: escapar primero, transformar despues — nunca al reves.
- DO: whitelist de esquema de URL (`http://`, `https://`, `/`) tanto para
  links como para imagenes.
- DON'T: usar ninguna dependencia npm de markdown/sanitizacion
  (`deps_allowed: []`) ni `innerHTML`-equivalentes sin escapar en el propio
  render — esto corre en Node generando el string HTML, no en el DOM.

## Tests
(Los tests estan en `src/agent/web/render_markdown.test.ts`, oraculo
congelado con `node:test`: parrafos, escapado/XSS, bold/italic/code,
links/imagenes seguros e inseguros, listas, multiples bloques, input
vacio, URL relativa, headings h1/h2/h3, heading+lista sin linea en blanco
entre ellos, parrafo+lista sin linea en blanco, y dos grupos heading+lista
consecutivos.)

## Constraints
- Sin red, sin subprocess, sin llamadas a modelo (`forbids`).
- `touch_only`: unicamente `src/agent/web/render_markdown.ts`.
- PARAR y reportar si necesitas conectarte a la red.

## Criterios de aceptacion
- [ ] `node --test src/agent/web/render_markdown.test.ts` sale en 0.
- [ ] `python scripts/validate_contracts.py knowledge/contracts` sigue en
      0 errores con este contrato incluido.
