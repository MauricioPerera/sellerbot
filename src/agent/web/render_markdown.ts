// Renderer de markdown minimo, seguro contra XSS.
// El input SIEMPRE es output de un LLM que puede reflejar input del usuario,
// asi que se renderiza como HTML en un navegador: TODO caracter HTML especial
// se escapa ANTES de aplicar cualquier transformacion de markdown. Sin
// libreria externa (deps_allowed: []). Mismo espiritu que
// calculate_expression.ts y parse_woocommerce_csv.ts: control total.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escapa TODO caracter HTML especial del texto. Se aplica ANTES de cualquier
// transformacion de markdown: el markdown vive sobre texto ya escapado, asi
// que un `<script>` del input nunca llega como tag al output.
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// Whitelist de esquema de URL: solo http://, https:// o rutas relativas con /.
// Cualquier otro esquema (javascript:, data:, ...) hace que el link/imagen NO
// se convierta en tag: el URL se descarta y queda solo el texto/alt.
function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|\/)/.test(url);
}

// `![alt](url)` -> <img ...> solo si url es segura; si no, descarta el URL y
// queda el alt como texto plano. Se aplica antes que los links porque la
// sintaxis de imagen (`![`) contiene la de link (`[...](...)`).
function renderImages(text: string): string {
  return text.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_m, alt: string, url: string) => {
    if (isSafeUrl(url)) {
      return `<img src="${url}" alt="${alt}" loading="lazy">`;
    }
    return alt;
  });
}

// `[texto](url)` -> <a ...> solo si url es segura; si no, descarta el URL y
// queda el texto del link como texto plano, sin generar <a>.
function renderLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_m, linkText: string, url: string) => {
    if (isSafeUrl(url)) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    }
    return linkText;
  });
}

// `` `codigo` `` -> <code>codigo</code>.
function renderCode(text: string): string {
  return text.replace(/`([^`]+)`/g, "<code>$1</code>");
}

// `**texto**` -> <strong>texto</strong>. Se aplica antes que italic: el `**`
// contiene `*`, y procesar bold primero evita que italic se trague un par.
function renderBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

// `*texto*` -> <em>texto</em>.
function renderItalic(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

// Aplica todas las transformaciones inline sobre texto ya escapado. Orden:
// imagenes antes que links (la sintaxis de imagen contiene la de link), luego
// code, bold (antes que italic por el solapamiento de `*`).
function renderInline(text: string): string {
  let out = text;
  out = renderImages(out);
  out = renderLinks(out);
  out = renderCode(out);
  out = renderBold(out);
  out = renderItalic(out);
  return out;
}

// Renderiza un bloque lista: una <li> por linea (sin el prefijo `- `).
function renderList(lines: string[]): string {
  const items = lines
    .map((line) => `<li>${renderInline(line.slice(2))}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

// Nivel de heading (1-3) si la linea empieza con 1-3 `#` seguidos de un
// espacio; si no, null. El `#` no es un caracter HTML especial, asi que sigue
// presente tras el escape global.
function headingLevel(line: string): number | null {
  const m = /^(#{1,3}) /.exec(line);
  return m ? m[1].length : null;
}

// Renderiza un bloque. DENTRO del bloque (ya separado por lineas en blanco) se
// subdivide ADEMAS por transicion de tipo de linea, sin necesitar linea en
// blanco: cada linea heading es su propio elemento; una corrida de lineas
// `- ` es su propia <ul>; el resto de lineas consecutivas forman un <p>.
function renderBlock(block: string): string {
  const lines = block.split("\n");
  let out = "";
  let i = 0;
  while (i < lines.length) {
    const level = headingLevel(lines[i]);
    if (level !== null) {
      const text = lines[i].slice(level + 1);
      out += `<h${level}>${renderInline(text)}</h${level}>`;
      i += 1;
      continue;
    }
    if (lines[i].startsWith("- ")) {
      const run: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        run.push(lines[i]);
        i += 1;
      }
      out += renderList(run);
      continue;
    }
    const run: string[] = [];
    while (
      i < lines.length &&
      headingLevel(lines[i]) === null &&
      !lines[i].startsWith("- ")
    ) {
      run.push(lines[i]);
      i += 1;
    }
    out += `<p>${renderInline(run.join("\n"))}</p>`;
  }
  return out;
}

// Convierte un subconjunto minimo de markdown a HTML escapado. Los bloques se
// separan por una o mas lineas en blanco; input vacio devuelve "".
export function renderMarkdown(input: string): string {
  if (input === "") return "";
  const escaped = escapeHtml(input);
  const blocks = escaped.split(/\n{2,}/).map((b) => b.trim()).filter((b) => b !== "");
  return blocks.map(renderBlock).join("");
}