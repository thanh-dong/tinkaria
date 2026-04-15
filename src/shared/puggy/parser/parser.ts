import { diagnostic } from "../diagnostics/result";
import type {
  AttrNode,
  BlockNode,
  EachNode,
  ElementNode,
  IfNode,
  MixinNode,
  ParseResult,
  PuggyNode
} from "./ast";

interface SourceLine {
  readonly raw: string;
  readonly text: string;
  readonly line: number;
  readonly indent: number;
  readonly column: number;
}

interface Frame {
  readonly indent: number;
  readonly children: PuggyNode[];
  readonly node?: PuggyNode;
}

const UNKNOWN_DIRECTIVES = new Set(["switch", "case", "while", "for", "unless", "extends:"]);
const RESERVED_DIRECTIVES = new Set(["if", "else", "each", "include", "extends", "block", "mixin"]);
const ATTR_NAME_PATTERN = /^[A-Za-z_:][A-Za-z0-9_:-]*$/;

export function parsePuggy(source: string): ParseResult {
  const lines = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((raw, index): SourceLine | null => {
      if (raw.trim() === "") {
        return null;
      }

      const indent = raw.match(/^ */)?.[0].length ?? 0;
      return {
        raw,
        text: raw.slice(indent),
        line: index + 1,
        indent,
        column: indent + 1
      };
    })
    .filter((line): line is SourceLine => line !== null);

  const root: PuggyNode[] = [];
  const stack: Frame[] = [{ indent: -2, children: root }];
  let previousIndent = 0;
  let previousCanHaveChildren = true;

  for (const line of lines) {
    while (stack.length > 1 && line.indent <= stack[stack.length - 1]!.indent) {
      stack.pop();
    }

    const rawParent = stack[stack.length - 1]!;
    if (rawParent.node?.kind === "element" && rawParent.node.rawText && line.indent > rawParent.indent) {
      rawParent.children.push({
        kind: "text",
        value: line.raw.slice(Math.min(line.raw.length, rawParent.indent + 2)),
        line: line.line,
        column: rawParent.indent + 3
      });
      previousIndent = line.indent;
      previousCanHaveChildren = true;
      continue;
    }

    if (
      line.indent % 2 !== 0 ||
      line.indent > previousIndent + 2 ||
      (line.indent > previousIndent && !previousCanHaveChildren)
    ) {
      return {
        ok: false,
        diagnostics: [diagnostic("PUGGY_BAD_INDENT", "Invalid indentation level.", line.line, line.column)]
      };
    }

    const parsed = parseLine(line);
    if (!parsed.ok) {
      return parsed;
    }

    const parent = stack[stack.length - 1]!;
    if (parsed.node.kind === "else") {
      const prior = parent.children[parent.children.length - 1];
      if (prior?.kind !== "if") {
        return {
          ok: false,
          diagnostics: [diagnostic("PUGGY_UNKNOWN_DIRECTIVE", "Unknown directive: else.", line.line, line.column)]
        };
      }
      stack.push({ indent: line.indent, children: prior.alternate, node: prior });
      previousIndent = line.indent;
      previousCanHaveChildren = true;
      continue;
    }

    parent.children.push(parsed.node);
    const childTarget = getChildTarget(parsed.node);
    if (childTarget) {
      stack.push({ indent: line.indent, children: childTarget, node: parsed.node });
    }

    previousIndent = line.indent;
    previousCanHaveChildren = childTarget !== null;
  }

  return { ok: true, nodes: root };
}

type ParsedLine =
  | { readonly ok: true; readonly node: PuggyNode | { readonly kind: "else" } }
  | { readonly ok: false; readonly diagnostics: ReturnType<typeof diagnostic>[] };

function parseLine(line: SourceLine): ParsedLine {
  const [head] = line.text.split(/\s+/, 1);

  if (line.text.startsWith("//-") || /^doctype(?:\s+|$)/.test(line.text)) {
    return {
      ok: true,
      node: {
        kind: "omit",
        children: [],
        line: line.line,
        column: line.column
      }
    };
  }

  const textMatch = /^\|\s?(.*)$/.exec(line.text);
  if (textMatch) {
    return {
      ok: true,
      node: {
        kind: "text",
        value: textMatch[1] ?? "",
        line: line.line,
        column: line.column + 2
      }
    };
  }

  const exprTextMatch = /^=\s?(.*)$/.exec(line.text);
  if (exprTextMatch) {
    return {
      ok: true,
      node: {
        kind: "expr",
        expression: exprTextMatch[1] ?? "",
        line: line.line,
        column: line.column + 1
      }
    };
  }

  if (head && UNKNOWN_DIRECTIVES.has(head)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic("PUGGY_UNKNOWN_DIRECTIVE", `Unknown directive: ${head}.`, line.line, line.column)
      ]
    };
  }

  if (line.text === "else") {
    return { ok: true, node: { kind: "else" } };
  }

  const ifMatch = /^if\s+(.+)$/.exec(line.text);
  if (ifMatch) {
    const node: IfNode = {
      kind: "if",
      expression: ifMatch[1]!.trim(),
      consequent: [],
      alternate: [],
      line: line.line,
      column: line.column
    };
    return { ok: true, node };
  }

  const eachMatch = /^each\s+([A-Za-z_$][\w$]*)\s+in\s+(.+)$/.exec(line.text);
  if (eachMatch) {
    const node: EachNode = {
      kind: "each",
      itemName: eachMatch[1]!,
      listExpression: eachMatch[2]!.trim(),
      children: [],
      line: line.line,
      column: line.column
    };
    return { ok: true, node };
  }

  const includeMatch = /^include\s+([A-Za-z0-9_$./-]+)$/.exec(line.text);
  if (includeMatch) {
    return {
      ok: true,
      node: { kind: "include", name: includeMatch[1]!, line: line.line, column: line.column }
    };
  }

  const extendsMatch = /^extends\s+([A-Za-z0-9_$./-]+)$/.exec(line.text);
  if (extendsMatch) {
    return {
      ok: true,
      node: { kind: "extends", name: extendsMatch[1]!, line: line.line, column: line.column }
    };
  }

  const blockMatch = /^block\s+([A-Za-z_$][\w$-]*)$/.exec(line.text);
  if (blockMatch) {
    const node: BlockNode = {
      kind: "block",
      name: blockMatch[1]!,
      children: [],
      line: line.line,
      column: line.column
    };
    return { ok: true, node };
  }

  const mixinMatch = /^mixin\s+([A-Za-z_$][\w$]*)\(([^)]*)\)$/.exec(line.text);
  if (mixinMatch) {
    const params = splitArgs(mixinMatch[2]!).map((arg) => arg.trim()).filter(Boolean);
    const node: MixinNode = {
      kind: "mixin",
      name: mixinMatch[1]!,
      params,
      children: [],
      line: line.line,
      column: line.column
    };
    return { ok: true, node };
  }

  const callMatch = /^\+([A-Za-z_$][\w$]*)\((.*)\)$/.exec(line.text);
  if (callMatch) {
    return {
      ok: true,
      node: {
        kind: "mixin-call",
        name: callMatch[1]!,
        args: splitArgs(callMatch[2]!),
        line: line.line,
        column: line.column
      }
    };
  }

  if (head && RESERVED_DIRECTIVES.has(head)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic("PUGGY_UNKNOWN_DIRECTIVE", `Unknown directive: ${head}.`, line.line, line.column)
      ]
    };
  }

  return parseElement(normalizeColonInlineElement(line));
}

function normalizeColonInlineElement(line: SourceLine): SourceLine {
  const colonMatch = /^([A-Za-z][\w.#-]*(?:\([^)]*\))?):\s+[A-Za-z][\w.#-]*(?:\([^)]*\))?\s+(.+)$/.exec(line.text);
  if (!colonMatch) {
    return line;
  }
  return { ...line, text: `${colonMatch[1]!} ${colonMatch[2]!}` };
}

function parseElement(line: SourceLine): ParsedLine {
  const split = splitElementSource(line.text);
  const attrStart = findAttrStart(split.head);
  const attrEnd = attrStart >= 0 ? findAttrEnd(split.head, attrStart) : -1;
  if (attrStart >= 0 && attrEnd < 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic("PUGGY_UNCLOSED_ATTRS", "Unclosed attribute list.", line.line, line.column + split.head.length)
      ]
    };
  }

  const head = split.head.trimEnd();
  const rawText = attrStart < 0 && head.endsWith(".");
  const selectorHead = rawText ? head.slice(0, -1) : head;
  const selector = attrStart >= 0 ? selectorHead.slice(0, attrStart) : selectorHead;
  const attrSource = attrStart >= 0 && attrEnd >= 0 ? head.slice(attrStart + 1, attrEnd) : "";
  const parsedSelector = parseSelector(selector || "div");
  if (!parsedSelector.ok) {
    return {
      ok: false,
      diagnostics: [diagnostic(parsedSelector.code, parsedSelector.message, line.line, line.column)]
    };
  }
  const parsedAttrs = parseAttrs(attrSource, line, attrStart);
  if (!parsedAttrs.ok) {
    return { ok: false, diagnostics: parsedAttrs.diagnostics };
  }
  const node: ElementNode = {
    kind: "element",
    tag: parsedSelector.tag,
    classes: parsedSelector.classes,
    ...(parsedSelector.id ? { id: parsedSelector.id } : {}),
    attrs: parsedAttrs.attrs,
    children: [],
    line: line.line,
    column: line.column,
    ...(rawText ? { rawText } : {}),
    ...(split.kind === "expr"
      ? { expr: split.inline, exprColumn: line.column + split.inlineColumn - 1 }
      : split.inline
        ? { text: split.inline, textColumn: line.column + split.inlineColumn - 1 }
        : {})
  };

  return { ok: true, node };
}

function findAttrStart(source: string): number {
  let bracketDepth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (bracketDepth === 0 && char === "(") {
      return index;
    }
  }
  return -1;
}

function getChildTarget(node: PuggyNode): PuggyNode[] | null {
  switch (node.kind) {
    case "element":
    case "omit":
    case "each":
    case "block":
    case "mixin":
      return node.children;
    case "if":
      return node.consequent;
    default:
      return null;
  }
}

function parseSelector(selector: string):
  | { ok: true; tag: string; classes: string[]; id?: string }
  | { ok: false; code: string; message: string } {
  const tagMatch = /^[A-Za-z][\w-]*/.exec(selector);
  const tag = tagMatch?.[0] ?? "div";
  let cursor = tagMatch?.[0].length ?? 0;
  const classes: string[] = [];
  let id: string | undefined;

  while (cursor < selector.length) {
    const char = selector[cursor];
    if (char === ".") {
      const className = readClassName(selector, cursor + 1);
      if (!className) {
        return { ok: false, code: "PUGGY_UNSUPPORTED_SELECTOR", message: "Unsupported selector syntax." };
      }
      classes.push(className.value);
      cursor = className.end;
      continue;
    }
    if (char !== "#") {
      return { ok: false, code: "PUGGY_UNSUPPORTED_SELECTOR", message: "Unsupported selector syntax." };
    }

    const idMatch = /^#([A-Za-z0-9_-]+)/.exec(selector.slice(cursor));
    if (!idMatch) {
      return { ok: false, code: "PUGGY_UNSUPPORTED_SELECTOR", message: "Unsupported selector syntax." };
    }
    if (id !== undefined) {
      return { ok: false, code: "PUGGY_DUPLICATE_ID", message: "Duplicate id selector." };
    }
    id = idMatch[1]!;
    cursor += idMatch[0].length;
  }

  return { ok: true, tag, classes, ...(id ? { id } : {}) };
}

function readClassName(selector: string, start: number): { value: string; end: number } | null {
  let cursor = start;
  let bracketDepth = 0;
  let quote: string | null = null;

  while (cursor < selector.length) {
    const char = selector[cursor]!;
    if (quote) {
      if (char === quote && selector[cursor - 1] !== "\\") {
        quote = null;
      }
      cursor += 1;
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      cursor += 1;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      cursor += 1;
      continue;
    }
    if (char === "]") {
      bracketDepth -= 1;
      if (bracketDepth < 0) {
        return null;
      }
      cursor += 1;
      continue;
    }
    if (bracketDepth === 0 && (char === "." || char === "#")) {
      break;
    }
    if (/\s/.test(char)) {
      return null;
    }
    cursor += 1;
  }

  if (quote || bracketDepth !== 0 || cursor === start) {
    return null;
  }

  const value = selector.slice(start, cursor);
  if (!isSupportedClassName(value)) {
    return null;
  }
  return { value, end: cursor };
}

function isSupportedClassName(value: string): boolean {
  return /^[A-Za-z0-9_!:[\]#@%/>&=$*~|'"().,+-]+$/.test(value);
}

function parseAttrs(
  source: string,
  line: SourceLine,
  attrStart: number
):
  | { ok: true; attrs: AttrNode[] }
  | { ok: false; diagnostics: ReturnType<typeof diagnostic>[] } {
  if (source.trim() === "") {
    return { ok: true, attrs: [] };
  }

  const attrs: AttrNode[] = [];
  for (const part of splitArgs(source)) {
    const eq = part.indexOf("=");
    const name = (eq < 0 ? part : part.slice(0, eq)).trim();
    const column = line.column + attrStart + 1;
    if (!ATTR_NAME_PATTERN.test(name)) {
      return {
        ok: false,
        diagnostics: [diagnostic("PUGGY_INVALID_ATTR", "Invalid attribute name.", line.line, column)]
      };
    }

    if (eq < 0) {
      attrs.push({ name, value: null, expression: false, column });
      continue;
    }

    const rawValue = part.slice(eq + 1).trim();
    const quoted = /^"([\s\S]*)"$/.exec(rawValue) ?? /^'([\s\S]*)'$/.exec(rawValue);
    attrs.push({
      name,
      value: quoted ? quoted[1]! : rawValue,
      expression: !quoted,
      column
    });
  }

  return { ok: true, attrs };
}

export function splitArgs(source: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      current += char;
      if (char === quote && source[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if ((char === "," || /\s/.test(char)) && current.trim() !== "") {
      args.push(current.trim());
      current = "";
      continue;
    }

    if (char === "," || /\s/.test(char)) {
      continue;
    }

    current += char;
  }

  if (current.trim() !== "") {
    args.push(current.trim());
  }

  return args;
}

function findAttrEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === ")") {
      return index;
    }
  }
  return -1;
}

function splitElementSource(source: string): { head: string; inline: string; inlineColumn: number; kind: "text" | "expr" } {
  let depth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (char === quote && source[index - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth -= 1;
      continue;
    }
    if (char === "[") {
      bracketDepth += 1;
      continue;
    }
    if (char === "]") {
      bracketDepth -= 1;
      continue;
    }
    if (depth === 0 && bracketDepth === 0 && char === "=") {
      return {
        head: source.slice(0, index),
        inline: source.slice(index + 1).trimStart(),
        inlineColumn: index + 2 + countLeadingSpaces(source.slice(index + 1)),
        kind: "expr"
      };
    }
    if (depth === 0 && bracketDepth === 0 && /\s/.test(char)) {
      return {
        head: source.slice(0, index),
        inline: source.slice(index + 1),
        inlineColumn: index + 2,
        kind: "text"
      };
    }
  }
  return { head: source, inline: "", inlineColumn: source.length + 1, kind: "text" };
}

function countLeadingSpaces(source: string): number {
  return source.match(/^ */)?.[0].length ?? 0;
}
