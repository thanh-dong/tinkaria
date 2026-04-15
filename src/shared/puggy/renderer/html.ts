import { failure } from "../diagnostics/result";
import { evaluateExpression } from "../expressions/evaluate";
import { parsePuggy } from "../parser/parser";
import type { PuggyRenderOptions, PuggyRenderResult } from "../index";
import type { BlockNode, MixinNode, PuggyNode } from "../parser/ast";

interface RenderState {
  readonly data: Record<string, unknown>;
  readonly options: PuggyRenderOptions;
  readonly mixins: Map<string, MixinNode>;
  readonly blocks: Map<string, BlockNode>;
  readonly includeStack: readonly string[];
  readonly mixinStack: readonly string[];
}

const UNSAFE_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "base",
  "link",
  "meta",
  "svg",
  "math",
  "template",
  "plaintext",
  "xmp",
  "noscript"
]);
const URL_ATTRS = new Set(["href", "src", "action", "formaction"]);

export function renderHtml(
  source: string,
  data: Record<string, unknown>,
  options: PuggyRenderOptions
): PuggyRenderResult {
  const parsed = parsePuggy(source);
  if (!parsed.ok) {
    return failure(parsed.diagnostics);
  }

  const state: RenderState = {
    data,
    options,
    mixins: new Map(),
    blocks: collectBlocks(parsed.nodes),
    includeStack: [],
    mixinStack: []
  };

  const expanded = expandExtends(parsed.nodes, state);
  if (!expanded.ok) {
    return expanded;
  }

  const rendered = renderNodes(expanded.nodes, state);
  if (!rendered.ok) {
    return rendered;
  }

  return { ok: true, html: rendered.html, diagnostics: [] };
}

type Rendered =
  | { readonly ok: true; readonly html: string }
  | Extract<PuggyRenderResult, { ok: false }>;

type Expanded =
  | { readonly ok: true; readonly nodes: readonly PuggyNode[] }
  | Extract<PuggyRenderResult, { ok: false }>;

function renderNodes(nodes: readonly PuggyNode[], state: RenderState): Rendered {
  let html = "";

  for (const node of nodes) {
    const rendered = renderNode(node, state);
    if (!rendered.ok) {
      return rendered;
    }
    html += rendered.html;
  }

  return { ok: true, html };
}

function renderNode(node: PuggyNode, state: RenderState): Rendered {
  switch (node.kind) {
    case "element":
      return renderElement(node, state);
    case "text":
      {
        const interpolated = interpolate(node.value, state, node.line, node.column);
        if (!interpolated.ok) {
          return failure([interpolated.diagnostic]);
        }
        return { ok: true, html: escapeHtml(interpolated.value) };
      }
    case "expr": {
      const value = evaluateExpression(node.expression, state.data, node.line, node.column, state.options.expressions);
      return value.ok ? { ok: true, html: escapeHtml(stringify(value.value)) } : failure([value.diagnostic]);
    }
    case "if": {
      const value = evaluateExpression(node.expression, state.data, node.line, node.column + 3, state.options.expressions);
      if (!value.ok) {
        return failure([value.diagnostic]);
      }
      return renderNodes(value.value ? node.consequent : node.alternate, state);
    }
    case "each": {
      const value = evaluateExpression(node.listExpression, state.data, node.line, node.column, state.options.expressions);
      if (!value.ok) {
        return failure([value.diagnostic]);
      }
      if (!Array.isArray(value.value)) {
        return { ok: true, html: "" };
      }
      let html = "";
      for (const item of value.value) {
        const childState = { ...state, data: { ...state.data, [node.itemName]: item } };
        const rendered = renderNodes(node.children, childState);
        if (!rendered.ok) {
          return rendered;
        }
        html += rendered.html;
      }
      return { ok: true, html };
    }
    case "include": {
      if (state.includeStack.includes(node.name)) {
        return failure([
          {
            code: "PUGGY_INCLUDE_CYCLE",
            message: "Recursive include is not allowed.",
            line: node.line,
            column: node.column
          }
        ]);
      }
      const moduleSource = state.options.modules?.[node.name];
      if (moduleSource === undefined) {
        return failure([
          {
            code: "PUGGY_MISSING_MODULE",
            message: `Missing virtual module: ${node.name}.`,
            line: node.line,
            column: node.column
          }
        ]);
      }
      const parsed = parsePuggy(moduleSource);
      if (!parsed.ok) {
        return failure(parsed.diagnostics);
      }
      return renderNodes(parsed.nodes, { ...state, includeStack: [...state.includeStack, node.name] });
    }
    case "block":
      return renderNodes(node.children, state);
    case "mixin":
      state.mixins.set(node.name, node);
      return { ok: true, html: "" };
    case "mixin-call": {
      const mixin = state.mixins.get(node.name);
      if (!mixin) {
        return failure([
          {
            code: "PUGGY_UNKNOWN_MIXIN",
            message: `Unknown mixin: ${node.name}.`,
            line: node.line,
            column: node.column
          }
        ]);
      }
      if (state.mixinStack.includes(node.name)) {
        return failure([
          {
            code: "PUGGY_MIXIN_CYCLE",
            message: "Recursive mixin call is not allowed.",
            line: node.line,
            column: node.column
          }
        ]);
      }
      const localData: Record<string, unknown> = { ...state.data };
      for (let index = 0; index < mixin.params.length; index += 1) {
        const arg = node.args[index] ?? "";
        const value = evaluateExpression(arg, state.data, node.line, node.column + 1, state.options.expressions);
        if (!value.ok) {
          return failure([value.diagnostic]);
        }
        localData[mixin.params[index]!] = value.value;
      }
      return renderNodes(mixin.children, {
        ...state,
        data: localData,
        mixinStack: [...state.mixinStack, node.name]
      });
    }
    case "extends":
      return { ok: true, html: "" };
    default:
      return { ok: true, html: "" };
  }
}

function renderElement(
  node: Extract<PuggyNode, { kind: "element" }>,
  state: RenderState
): Rendered {
  if (UNSAFE_TAGS.has(node.tag.toLowerCase())) {
    return failure([
      {
        code: "PUGGY_UNSAFE_TAG",
        message: "Unsafe tag is not allowed.",
        line: node.line,
        column: node.column
      }
    ]);
  }

  const attrs: string[] = [];
  if (node.classes.length > 0) {
    attrs.push(`class="${escapeHtml(node.classes.join(" "))}"`);
  }
  if (node.id) {
    attrs.push(`id="${escapeHtml(node.id)}"`);
  }

  for (const attr of node.attrs) {
    if (isUnsafeAttrName(attr.name)) {
      return failure([
        {
          code: "PUGGY_UNSAFE_ATTR",
          message: "Unsafe attribute is not allowed.",
          line: node.line,
          column: attr.column
        }
      ]);
    }
    if (attr.value === null) {
      attrs.push(attr.name);
      continue;
    }
    const value = attr.expression
      ? evaluateExpression(attr.value, state.data, node.line, node.column, state.options.expressions)
      : { ok: true as const, value: attr.value };
    if (!value.ok) {
      return failure([value.diagnostic]);
    }
    const attrValue = stringify(value.value);
    if (isUrlAttr(attr.name) && isUnsafeUrl(attrValue)) {
      return failure([
        {
          code: "PUGGY_UNSAFE_URL",
          message: "Unsafe URL protocol is not allowed.",
          line: node.line,
          column: attr.column
        }
      ]);
    }
    attrs.push(`${attr.name}="${escapeHtml(attrValue)}"`);
  }

  const attrText = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
  let body = "";
  if (node.text) {
    const interpolated = interpolate(node.text, state, node.line, node.textColumn ?? node.column);
    if (!interpolated.ok) {
      return failure([interpolated.diagnostic]);
    }
    body += escapeHtml(interpolated.value);
  }
  if (node.expr) {
    const value = evaluateExpression(node.expr, state.data, node.line, node.exprColumn ?? node.column, state.options.expressions);
    if (!value.ok) {
      return failure([value.diagnostic]);
    }
    body += escapeHtml(stringify(value.value));
  }

  const children = renderNodes(node.children, state);
  if (!children.ok) {
    return children;
  }
  body += children.html;

  return { ok: true, html: `<${node.tag}${attrText}>${body}</${node.tag}>` };
}

function isUnsafeAttrName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("on") || lower === "srcdoc" || lower === "style";
}

function isUrlAttr(name: string): boolean {
  const lower = name.toLowerCase();
  return URL_ATTRS.has(lower) || lower.endsWith(":href") || lower.endsWith(":src");
}

function isUnsafeUrl(value: string): boolean {
  return /^\s*(?:javascript|vbscript|data):/i.test(value);
}

function expandExtends(
  nodes: readonly PuggyNode[],
  state: RenderState
): Expanded {
  const first = nodes.find((node) => node.kind !== "block");
  if (first?.kind !== "extends") {
    return { ok: true, nodes };
  }

  const moduleSource = state.options.modules?.[first.name];
  if (moduleSource === undefined) {
    return failure([
      {
        code: "PUGGY_MISSING_MODULE",
        message: `Missing virtual module: ${first.name}.`,
        line: first.line,
        column: first.column
      }
    ]);
  }

  const parsed = parsePuggy(moduleSource);
  if (!parsed.ok) {
    return failure(parsed.diagnostics);
  }

  return { ok: true, nodes: replaceBlocks(parsed.nodes, state.blocks) };
}

function replaceBlocks(nodes: readonly PuggyNode[], blocks: ReadonlyMap<string, BlockNode>): PuggyNode[] {
  return nodes.map((node) => {
    if (node.kind === "block") {
      return blocks.get(node.name) ?? node;
    }
    if ("children" in node) {
      return { ...node, children: replaceBlocks(node.children, blocks) } as PuggyNode;
    }
    if (node.kind === "if") {
      return {
        ...node,
        consequent: replaceBlocks(node.consequent, blocks),
        alternate: replaceBlocks(node.alternate, blocks)
      };
    }
    return node;
  });
}

function collectBlocks(nodes: readonly PuggyNode[]): Map<string, BlockNode> {
  const blocks = new Map<string, BlockNode>();
  for (const node of nodes) {
    if (node.kind === "block") {
      blocks.set(node.name, node);
    }
  }
  return blocks;
}

function interpolate(
  text: string,
  state: RenderState,
  line: number,
  column: number
):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly diagnostic: ReturnType<typeof evaluateExpression> extends infer T ? T extends { ok: false; diagnostic: infer D } ? D : never : never } {
  let value = "";
  let cursor = 0;
  const pattern = /#\{([^}]*)\}/g;
  for (const match of text.matchAll(pattern)) {
    value += text.slice(cursor, match.index);
    const expr = match[1] ?? "";
    const evaluated = evaluateExpression(expr, state.data, line, column + (match.index ?? 0) + 2, state.options.expressions);
    if (!evaluated.ok) {
      return { ok: false, diagnostic: evaluated.diagnostic };
    }
    value += stringify(evaluated.value);
    cursor = (match.index ?? 0) + match[0].length;
  }
  value += text.slice(cursor);
  return { ok: true, value };
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "object" || typeof value === "function" || typeof value === "symbol") {
    return "";
  }
  return String(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&quot;";
    }
  });
}
