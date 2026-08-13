interface ParserState {
  src: string;
  pos: number;
}

function peek(state: ParserState): string | undefined {
  return state.src[state.pos];
}

function skipSpaces(state: ParserState): void {
  while (state.src[state.pos] === " ") state.pos += 1;
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function parseNumber(state: ParserState): number {
  skipSpaces(state);
  const start = state.pos;
  while (state.pos < state.src.length && /[0-9.]/.test(state.src[state.pos])) state.pos += 1;
  const raw = state.src.slice(start, state.pos);
  const value = raw === "" ? NaN : Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`unexpected character '${peek(state) ?? ""}' at position ${state.pos}`);
  }
  return value;
}

function parseFactor(state: ParserState): number {
  skipSpaces(state);
  const ch = peek(state);
  if (ch === "-") {
    state.pos += 1;
    return -parseFactor(state);
  }
  if (ch === "+") {
    state.pos += 1;
    return parseFactor(state);
  }
  if (ch === "(") {
    state.pos += 1;
    const value = parseExpr(state);
    skipSpaces(state);
    if (peek(state) !== ")") {
      throw new Error("expected ')'");
    }
    state.pos += 1;
    return value;
  }
  return parseNumber(state);
}

function parseTerm(state: ParserState): number {
  let value = parseFactor(state);
  skipSpaces(state);
  while (peek(state) === "*" || peek(state) === "/") {
    const op = peek(state);
    state.pos += 1;
    const rhs = parseFactor(state);
    if (op === "*") {
      value *= rhs;
    } else if (rhs === 0) {
      throw new Error("division by zero");
    } else {
      value /= rhs;
    }
    skipSpaces(state);
  }
  return value;
}

function parseExpr(state: ParserState): number {
  let value = parseTerm(state);
  skipSpaces(state);
  while (peek(state) === "+" || peek(state) === "-") {
    const op = peek(state);
    state.pos += 1;
    const rhs = parseTerm(state);
    value = op === "+" ? value + rhs : value - rhs;
    skipSpaces(state);
  }
  return value;
}

export function calculateExpression(expression: string): number {
  const src = expression.trim();
  if (src === "") {
    throw new Error("empty expression");
  }

  const state: ParserState = { src, pos: 0 };
  const result = parseExpr(state);
  skipSpaces(state);
  if (state.pos !== src.length) {
    throw new Error(`unexpected trailing input at position ${state.pos}`);
  }
  return normalizeZero(result);
}
