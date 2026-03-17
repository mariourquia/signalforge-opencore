// @signalforge/dsl-core -- AST printer (for round-trip testing)
// AGPL-3.0-only -- must NEVER import from closed packages.

import type { AstNode } from "./ast.js";

export function printAst(node: AstNode): string {
  switch (node.kind) {
    case "NumberLiteral":
      return String(node.value);
    case "FieldRef":
      return node.name;
    case "BinaryExpr": {
      const left = printAst(node.left);
      const right = printAst(node.right);
      return `(${left} ${node.op} ${right})`;
    }
    case "UnaryExpr": {
      const operand = printAst(node.operand);
      return `(- ${operand})`;
    }
    case "FunctionCall": {
      const args = node.args.map(printAst).join(", ");
      return `${node.name}(${args})`;
    }
  }
}
