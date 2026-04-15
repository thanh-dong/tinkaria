import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { getContentOverlayUiIdentityProps } from "../rich-content/ContentOverlay"
import {
  LOCAL_FILE_PREVIEW_DIALOG_UI_ID,
  LocalFilePreviewContent,
  getDialogTitle,
  getLocalFilePreviewType,
  getLocalFilePreviewDialogUiIdentityProps,
  normalizeLocalFilePreviewMarkdown,
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

  test("preserves ASCII tree spacing in markdown previews", () => {
    const content = [
      "c3-design/",
      "├── .claude-plugin/  # Plugin metadata",
      "│   ├── plugin.json",
      "│   └── marketplace.json",
      "└── scripts/",
      "    └── build.sh  # Cross-compile Go CLI",
    ].join("\n")
    const normalized = normalizeLocalFilePreviewMarkdown(content)
    const html = renderToStaticMarkup(
      <LocalFilePreviewContent
        preview={{
          path: "/tmp/README.md",
          content,
        }}
        onOpenLocalLink={() => {}}
      />
    )

    expect(normalized).toContain("```text\nc3-design/")
    expect(html).toContain("<pre")
    expect(html).toContain("whitespace-pre")
    expect(html).toContain("├──")
    expect(html).toContain("claude")
    expect(html).toContain("plugin")
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

    // SVG renders as content only — controls are in the overlay toolbar, not inline
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
      "data-ui-c3-label": "messages",
    })
  })

  test("uses rich content viewer types that match the previewed file", () => {
    expect(getLocalFilePreviewType("/tmp/README.md")).toBe("markdown")
    expect(getLocalFilePreviewType("/tmp/diagram.svg")).toBe("embed")
    expect(getLocalFilePreviewType("/tmp/app.ts")).toBe("code")
  })

  test("shows local file preview titles relative to the workspace path", () => {
    expect(
      getDialogTitle({
        path: "/home/lagz0ne/dev/kanna/src/client/app.tsx",
        line: 12,
        column: 3,
      }, "/home/lagz0ne/dev/kanna")
    ).toBe("src/client/app.tsx:12:3")
  })

  test("reuses the rich content overlay identity contract for local file previews", () => {
    expect(getLocalFilePreviewDialogUiIdentityProps()).toMatchObject(getContentOverlayUiIdentityProps(LOCAL_FILE_PREVIEW_DIALOG_UI_ID))
    expect(getLocalFilePreviewDialogUiIdentityProps()).toMatchObject({
      "data-ui-id": LOCAL_FILE_PREVIEW_DIALOG_UI_ID,
      "data-ui-c3": "c3-111",
      "data-ui-c3-label": "messages",
    })
  })
})
