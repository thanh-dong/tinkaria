import type { PuggyDiagnostic, PuggyRenderFailure } from "../index";

export function diagnostic(
  code: string,
  message: string,
  line: number,
  column: number
): PuggyDiagnostic {
  return { code, message, line, column };
}

export function failure(diagnostics: readonly PuggyDiagnostic[]): PuggyRenderFailure {
  return {
    ok: false,
    html: "",
    diagnostics
  };
}
