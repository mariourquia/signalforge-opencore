// @signalforge/dsl-core -- Pratt parser
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode, Span } from "./ast.js";
import type { CompilerError } from "./errors.js";
import {
  emptyInput,
  expectedClosingParen,
  expectedCommaOrParen,
  expectedExpression,
  maxDepthExceeded,
  unexpectedEof,
  unexpectedToken,
  unknownFunction,
} from "./errors.js";
import type { Token, TokenKind } from "./lexer.js";
import { tokenize } from "./lexer.js";
import { FUNCTION_REGISTRY } from "./allowed-functions.js";
import { levenshtein } from "./utils/levenshtein.js";

export interface ParseResult {
  readonly ast: AstNode | null;
  readonly errors: readonly CompilerError[];
}

// --- Binding powers ---

function getInfixBindingPower(kind: TokenKind): number {
  switch (kind) {
    case "Plus":
    case "Minus":
      return 10;
    case "Star":
    case "Slash":
      return 20;
    default:
      return 0;
  }
}

function tokenKindToOp(kind: TokenKind): "+" | "-" | "*" | "/" | null {
  switch (kind) {
    case "Plus":
      return "+";
    case "Minus":
      return "-";
    case "Star":
      return "*";
    case "Slash":
      return "/";
    default:
      return null;
  }
}

const UNARY_BP = 30;

// --- Function suggestion using Levenshtein distance ---

function suggestFunction(name: string): string | undefined {
  let bestName: string | undefined;
  let bestDist = Infinity;

  for (const registeredName of FUNCTION_REGISTRY.keys()) {
    const dist = levenshtein(name, registeredName);
    if (dist < bestDist) {
      bestDist = dist;
      bestName = registeredName;
    }
  }

  // Only suggest if the distance is reasonable (at most half the name length + 1)
  if (bestName !== undefined && bestDist <= Math.floor(bestName.length / 2) + 1) {
    return bestName;
  }
  return undefined;
}

// --- Parser state ---

class Parser {
  private static readonly MAX_DEPTH = 100;

  private readonly tokens: readonly Token[];
  private pos: number = 0;
  private readonly errors: CompilerError[] = [];
  private depth: number = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private advance(): Token {
    const tok = this.tokens[this.pos]!;
    if (tok.kind !== "EOF") {
      this.pos++;
    }
    return tok;
  }

  private expect(kind: TokenKind): Token | null {
    const tok = this.peek();
    if (tok.kind === kind) {
      return this.advance();
    }
    return null;
  }

  parse(): ParseResult {
    const first = this.peek();

    // Handle empty input
    if (first.kind === "EOF") {
      this.errors.push(emptyInput(first.span));
      return { ast: null, errors: this.errors };
    }

    const ast = this.parseExpression(0);

    // Check for trailing tokens (not EOF)
    if (this.peek().kind !== "EOF") {
      const trailing = this.peek();
      this.errors.push(unexpectedToken(trailing.span, trailing.text));
      // Skip all trailing tokens
      while (this.peek().kind !== "EOF") {
        this.advance();
      }
    }

    return { ast, errors: this.errors };
  }

  private parseExpression(bp: number): AstNode {
    this.depth++;
    if (this.depth > Parser.MAX_DEPTH) {
      this.errors.push(maxDepthExceeded(this.peek().span));
      this.depth--;
      return { kind: "NumberLiteral", value: 0, span: this.peek().span };
    }

    const token = this.advance();
    let left = this.prefixParselet(token);

    while (bp < getInfixBindingPower(this.peek().kind)) {
      const opToken = this.advance();
      left = this.infixParselet(left, opToken);
    }

    this.depth--;
    return left;
  }

  private prefixParselet(token: Token): AstNode {
    switch (token.kind) {
      case "Number": {
        const value = Number(token.text);
        return { kind: "NumberLiteral", value, span: token.span };
      }

      case "Identifier": {
        // Check if this is a function call (next token is LParen)
        if (this.peek().kind === "LParen") {
          return this.parseFunctionCall(token);
        }
        return { kind: "FieldRef", name: token.text, span: token.span };
      }

      case "Minus": {
        const operand = this.parseExpression(UNARY_BP);
        const span = { start: token.span.start, end: operand.span.end };
        return { kind: "UnaryExpr", op: "-", operand, span };
      }

      case "LParen": {
        const inner = this.parseExpression(0);
        const rParen = this.expect("RParen");
        if (rParen === null) {
          this.errors.push(expectedClosingParen(this.peek().span));
          // Return partial expression
          return inner;
        }
        // Update the span to include the parens (the AST node keeps inner expression's structure)
        return inner;
      }

      case "EOF": {
        this.errors.push(unexpectedEof(token.span, "expression"));
        // Return a synthetic node to allow continued parsing
        return { kind: "NumberLiteral", value: 0, span: token.span };
      }

      default: {
        this.errors.push(expectedExpression(token.span, token.text));
        // Skip token and try to continue
        if (this.peek().kind !== "EOF") {
          return this.parseExpression(bp_for_recovery());
        }
        // If at EOF, return a synthetic node
        return { kind: "NumberLiteral", value: 0, span: token.span };
      }
    }
  }

  private infixParselet(left: AstNode, opToken: Token): AstNode {
    const op = tokenKindToOp(opToken.kind);
    if (op === null) {
      // Should not happen since we only enter infix path when BP > 0
      this.errors.push(unexpectedToken(opToken.span, opToken.text));
      return left;
    }

    const right = this.parseExpression(getInfixBindingPower(opToken.kind));
    const span: Span = { start: left.span.start, end: right.span.end };
    return { kind: "BinaryExpr", op, left, right, span };
  }

  private parseFunctionCall(nameToken: Token): AstNode {
    const name = nameToken.text;

    // Check if function is known
    if (!FUNCTION_REGISTRY.has(name)) {
      const suggestion = suggestFunction(name);
      this.errors.push(unknownFunction(nameToken.span, name, suggestion));
    }

    // Consume LParen
    this.advance();

    const args: AstNode[] = [];

    // Handle empty arg list
    if (this.peek().kind === "RParen") {
      const rParen = this.advance();
      const span: Span = { start: nameToken.span.start, end: rParen.span.end };
      return { kind: "FunctionCall", name, args, span };
    }

    // Parse first argument
    args.push(this.parseExpression(0));

    // Parse remaining arguments
    while (this.peek().kind === "Comma") {
      this.advance(); // consume comma
      args.push(this.parseExpression(0));
    }

    // Expect closing paren
    const rParen = this.expect("RParen");
    if (rParen === null) {
      const tok = this.peek();
      if (tok.kind === "EOF") {
        this.errors.push(expectedClosingParen(tok.span));
      } else {
        this.errors.push(expectedCommaOrParen(tok.span, tok.text));
        // Skip to RParen or EOF
        while (this.peek().kind !== "RParen" && this.peek().kind !== "EOF") {
          this.advance();
        }
        if (this.peek().kind === "RParen") {
          this.advance();
        }
      }
      const span: Span = {
        start: nameToken.span.start,
        end: this.tokens[this.pos - 1]!.span.end,
      };
      return { kind: "FunctionCall", name, args, span };
    }

    const span: Span = { start: nameToken.span.start, end: rParen.span.end };
    return { kind: "FunctionCall", name, args, span };
  }
}

// Recovery binding power: parse at minimum precedence
function bp_for_recovery(): number {
  return 0;
}

export function parseFormula(input: string): ParseResult {
  const { tokens, errors: lexErrors } = tokenize(input);
  const parser = new Parser(tokens);
  const result = parser.parse();

  return {
    ast: result.ast,
    errors: [...lexErrors, ...result.errors],
  };
}
