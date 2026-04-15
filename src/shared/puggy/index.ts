import { renderHtml } from "./renderer/html";

export interface PuggyDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
}

export interface PuggyRenderOptions {
  readonly modules?: Record<string, string>;
  readonly expressions?: PuggyExpressionProfile | PuggyExpressionOptions;
}

export type PuggyExpressionProfile = "data-only" | "ui-safe";

export type PuggyExpressionCapability =
  | string
  | number
  | boolean
  | null
  | undefined
  | PuggyExpressionCallable
  | { readonly [key: string]: PuggyExpressionCapability };

export type PuggyExpressionCallable = (...args: unknown[]) => unknown;

export interface PuggyExpressionOptions {
  readonly profile?: PuggyExpressionProfile;
  readonly allowCalls?: boolean;
  readonly capabilities?: Record<string, PuggyExpressionCapability>;
}

export interface PuggyRenderSuccess {
  readonly ok: true;
  readonly html: string;
  readonly diagnostics: readonly PuggyDiagnostic[];
}

export interface PuggyRenderFailure {
  readonly ok: false;
  readonly html: "";
  readonly diagnostics: readonly PuggyDiagnostic[];
}

export type PuggyRenderResult = PuggyRenderSuccess | PuggyRenderFailure;

export interface PuggyCompiledTemplate {
  render(data?: Record<string, unknown>): PuggyRenderResult;
}

export function render(
  source: string,
  data: Record<string, unknown> = {},
  options: PuggyRenderOptions = {}
): PuggyRenderResult {
  return renderHtml(source, data, options);
}

export function compile(
  source: string,
  options: PuggyRenderOptions = {}
): PuggyCompiledTemplate {
  return {
    render(data: Record<string, unknown> = {}) {
      return render(source, data, options);
    }
  };
}
