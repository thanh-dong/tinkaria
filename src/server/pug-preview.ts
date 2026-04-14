import { render as renderPug } from "pug"

export interface PugPreviewResult {
  html?: string
  error?: string
}

export function renderPugPreview(source: string): PugPreviewResult {
  try {
    return {
      html: renderPug(source, { doctype: "html" }),
    }
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
