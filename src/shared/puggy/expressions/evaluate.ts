import { diagnostic } from "../diagnostics/result";
import type {
  PuggyDiagnostic,
  PuggyExpressionCapability,
  PuggyExpressionOptions,
  PuggyExpressionProfile
} from "../index";

export interface EvalSuccess {
  readonly ok: true;
  readonly value: unknown;
}

export interface EvalFailure {
  readonly ok: false;
  readonly diagnostic: PuggyDiagnostic;
}

export type EvalResult = EvalSuccess | EvalFailure;

const DENIED_ROOTS = new Set([
  "process",
  "globalThis",
  "window",
  "document",
  "Math",
  "Date",
  "Intl",
  "JSON",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "RegExp",
  "Promise",
  "Reflect",
  "Proxy",
  "Symbol",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Function",
  "eval",
  "constructor",
  "__proto__",
  "prototype",
  "import",
  "require",
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "localStorage",
  "sessionStorage"
]);

export function evaluateExpression(
  expression: string,
  data: Record<string, unknown>,
  line: number,
  column: number,
  expressionOptions: PuggyExpressionProfile | PuggyExpressionOptions | undefined = undefined
): EvalResult {
  const trimmed = expression.trim();
  const stringLiteral = /^"([\s\S]*)"$/.exec(trimmed) ?? /^'([\s\S]*)'$/.exec(trimmed);
  if (stringLiteral) {
    return { ok: true, value: stringLiteral[1]!.replace(/\\"/g, "\"").replace(/\\'/g, "'") };
  }

  const denied = findDeniedRoot(trimmed);
  if (denied) {
    return {
      ok: false,
      diagnostic: diagnostic(
        "PUGGY_HOST_ACCESS_DENIED",
        "Host and global access are not allowed in expressions.",
        line,
        column + denied.index
      )
    };
  }

  const call = parseCall(trimmed);
  if (call) {
    const options = resolveExpressionOptions(expressionOptions);
    if (!options.allowCalls) {
      return {
        ok: false,
        diagnostic: diagnostic("PUGGY_UNSUPPORTED_EXPRESSION", "Unsupported expression.", line, column)
      };
    }

    const callee = readCapability(options.capabilities, call.callee);
    if (typeof callee !== "function") {
      return {
        ok: false,
        diagnostic: diagnostic(
          "PUGGY_HOST_ACCESS_DENIED",
          "Host and global access are not allowed in expressions.",
          line,
          column
        )
      };
    }

    const args: unknown[] = [];
    for (const arg of splitCallArgs(call.args)) {
      if (arg.trim() === "") {
        continue;
      }
      const value = evaluateExpression(arg, data, line, column, expressionOptions);
      if (!value.ok) {
        return value;
      }
      args.push(value.value);
    }

    return { ok: true, value: callee(...args) };
  }

  if (trimmed === "true") {
    return { ok: true, value: true };
  }
  if (trimmed === "false") {
    return { ok: true, value: false };
  }
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return { ok: true, value: Number(trimmed) };
  }

  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(trimmed)) {
    return { ok: true, value: readPath(data, trimmed) };
  }

  return {
    ok: false,
    diagnostic: diagnostic("PUGGY_UNSUPPORTED_EXPRESSION", "Unsupported expression.", line, column)
  };
}

interface ResolvedExpressionOptions {
  readonly allowCalls: boolean;
  readonly capabilities: Record<string, PuggyExpressionCapability>;
}

function resolveExpressionOptions(
  options: PuggyExpressionProfile | PuggyExpressionOptions | undefined
): ResolvedExpressionOptions {
  const normalized = typeof options === "string" ? { profile: options } : options ?? {};
  const profile = normalized.profile ?? "data-only";
  const capabilities = {
    ...(profile === "ui-safe" ? uiSafeCapabilities() : {}),
    ...(normalized.capabilities ?? {})
  };

  return {
    allowCalls: normalized.allowCalls ?? (profile === "ui-safe" || normalized.capabilities !== undefined),
    capabilities
  };
}

function uiSafeCapabilities(): Record<string, PuggyExpressionCapability> {
  return {
    math: {
      abs(value: unknown) {
        return Math.abs(Number(value));
      },
      ceil(value: unknown) {
        return Math.ceil(Number(value));
      },
      floor(value: unknown) {
        return Math.floor(Number(value));
      },
      max(...values: unknown[]) {
        return Math.max(...values.map(Number));
      },
      min(...values: unknown[]) {
        return Math.min(...values.map(Number));
      },
      round(value: unknown) {
        return Math.round(Number(value));
      },
      trunc(value: unknown) {
        return Math.trunc(Number(value));
      }
    },
    text: {
      lower(value: unknown) {
        return String(value).toLowerCase();
      },
      upper(value: unknown) {
        return String(value).toUpperCase();
      }
    }
  };
}

function parseCall(expression: string): { callee: string; args: string } | null {
  const match = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(([\s\S]*)\)$/.exec(expression);
  return match ? { callee: match[1]!, args: match[2]! } : null;
}

function findDeniedRoot(expression: string): { index: number } | null {
  for (const match of expression.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const token = match[0];
    if (DENIED_ROOTS.has(token)) {
      return { index: match.index ?? 0 };
    }
  }
  return null;
}

function readPath(data: Record<string, unknown>, path: string): unknown {
  let current: unknown = data;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, part);
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    current = descriptor.value;
  }
  return current;
}

function readCapability(root: Record<string, PuggyExpressionCapability>, path: string): unknown {
  let current: unknown = root;
  for (const part of path.split(".")) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, part);
    if (!descriptor || !("value" in descriptor)) {
      return undefined;
    }
    current = descriptor.value;
  }
  return current;
}

function splitCallArgs(source: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;

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

    if (char === "(") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim() !== "") {
    args.push(current.trim());
  }

  return args;
}
