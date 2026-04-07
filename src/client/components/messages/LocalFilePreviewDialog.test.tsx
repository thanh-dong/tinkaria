import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getContentOverlayUiIdentityProps } from "../rich-content/ContentOverlay"
import {
  LOCAL_FILE_PREVIEW_DIALOG_UI_ID,
  LocalFilePreviewContent,
  getLocalFilePreviewType,
  getLocalFilePreviewDialogUiIdentityProps,
} from "./LocalFilePreviewDialog"

describe("LocalFilePreviewContent", () => {
  test("renders markdown previews as markdown content", () => {
    const html = renderToStaticMarkup(
      <LocalFilePreviewContent
        preview={{
          path: "/tmp/README.md",
          content: "# Hello\n\n[Next](/tmp/next.md#L4)",
        }}
        onOpenLocalLink={() => {}}
      />
    )

    expect(html).toContain("Hello")
    expect(html).toContain("/tmp/next.md#L4")
    expect(html).not.toContain("group/rich-content")
  })

  test("renders non-markdown previews in the code viewer without extra chrome", () => {
    const html = renderToStaticMarkup(
      <LocalFilePreviewContent
        preview={{
          path: "/tmp/app.ts",
          content: "const answer = 42",
          line: 3,
        }}
        onOpenLocalLink={() => {}}
      />
    )

    expect(html).toContain("sh__token--keyword")
    expect(html).toContain("sh__token--identifier")
    expect(html).toContain(">answer<")
    expect(html).not.toContain("group/rich-content")
  })

  test("renders svg previews through the embed renderer without extra chrome", () => {
    const html = renderToStaticMarkup(
      <LocalFilePreviewContent
        preview={{
          path: "/tmp/diagram.svg",
          content: "<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\" /></svg>",
        }}
        onOpenLocalLink={() => {}}
      />
    )

    expect(html).toContain("Render")
    expect(html).toContain("Source")
    expect(html).toContain("data-svg-render")
    expect(html).not.toContain("sh__token--")
    expect(html).not.toContain("group/rich-content")
  })
})

describe("LocalFilePreviewDialog", () => {
  test("tags the visible fullscreen preview dialog root", () => {
    expect(LOCAL_FILE_PREVIEW_DIALOG_UI_ID).toBe("content-preview.dialog")
    expect(getLocalFilePreviewDialogUiIdentityProps()).toMatchObject({
      "data-ui-id": "content-preview.dialog",
      "data-ui-c3": "c3-111",
      "data-ui-c3-label": "transcript-surfaces",
    })
  })

  test("uses rich content viewer types that match the previewed file", () => {
    expect(getLocalFilePreviewType("/tmp/README.md")).toBe("markdown")
    expect(getLocalFilePreviewType("/tmp/diagram.svg")).toBe("embed")
    expect(getLocalFilePreviewType("/tmp/app.ts")).toBe("code")
  })

  test("reuses the rich content overlay identity contract for local file previews", () => {
    expect(getLocalFilePreviewDialogUiIdentityProps()).toMatchObject(getContentOverlayUiIdentityProps(LOCAL_FILE_PREVIEW_DIALOG_UI_ID))
    expect(getLocalFilePreviewDialogUiIdentityProps()).toMatchObject({
      "data-ui-id": LOCAL_FILE_PREVIEW_DIALOG_UI_ID,
      "data-ui-c3": "c3-111",
      "data-ui-c3-label": "transcript-surfaces",
    })
  })
})
