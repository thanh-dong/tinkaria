import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { createMarkdownComponents, markdownComponents, OpenLocalLinkProvider, extractLanguageFromChildren, extractText } from "./shared"

describe("extractLanguageFromChildren", () => {
  test("returns language from code element className", () => {
    const children = <code className="language-typescript">const x = 1</code>
    expect(extractLanguageFromChildren(children)).toBe("typescript")
  })

  test("returns null for code element without language class", () => {
    const children = <code>plain code</code>
    expect(extractLanguageFromChildren(children)).toBeNull()
  })

  test("returns null for non-element children", () => {
    expect(extractLanguageFromChildren("text")).toBeNull()
  })
})

describe("extractText", () => {
  test("extracts text from string", () => {
    expect(extractText("hello")).toBe("hello")
  })

  test("extracts text from number", () => {
    expect(extractText(42)).toBe("42")
  })

  test("extracts text from nested elements", () => {
    expect(extractText(<span>hello <b>world</b></span>)).toBe("hello world")
  })
})

describe("markdownComponents", () => {
  test("renders markdown headings with transcript-specific sizes and no bold weight", () => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {"# One\n## Two\n### Three\n#### Four\n##### Five\n###### Six"}
      </Markdown>
    )

    expect(html).toContain('<h1 class="text-[20px] font-normal')
    expect(html).toContain('<h2 class="text-[18px] font-normal')
    expect(html).toContain('<h3 class="text-[16px] font-normal')
    expect(html).toContain('<h4 class="text-[16px] font-normal')
    expect(html).toContain('<h5 class="text-[16px] font-normal')
    expect(html).toContain('<h6 class="text-[16px] font-normal')
  })

  test("renders markdown blockquotes with quote styling", () => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {"> quoted line"}
      </Markdown>
    )

    expect(html).toContain("<blockquote")
    expect(html).toContain("border-l-2")
    expect(html).toContain("<p")
    expect(html).toContain("quoted line")
  })

  test("preserves nested markdown inside blockquotes", () => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {"> [docs](https://example.com)\n> \n> - item"}
      </Markdown>
    )

    expect(html).toContain("<blockquote")
    expect(html).toContain("<a")
    expect(html).toContain("https://example.com")
    expect(html).toContain("<ul")
    expect(html).toContain("<li")
  })

  test("renders local file links without browser target handling", () => {
    const html = renderToStaticMarkup(
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={createMarkdownComponents({ onOpenLocalLink: () => {} })}
      >
        {"[app.ts](/Users/jake/Projects/kanna/src/client/app/App.tsx#L1)"}
      </Markdown>
    )

    expect(html).toContain("/Users/jake/Projects/kanna/src/client/app/App.tsx#L1")
    expect(html).not.toContain('target="_blank"')
  })

  test("renders local file links without browser target handling when provided by context", () => {
    const html = renderToStaticMarkup(
      <OpenLocalLinkProvider onOpenLocalLink={() => {}}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={createMarkdownComponents()}
        >
          {"[app.ts](/Users/jake/Projects/kanna/src/client/app/App.tsx#L1)"}
        </Markdown>
      </OpenLocalLinkProvider>
    )

    expect(html).toContain("/Users/jake/Projects/kanna/src/client/app/App.tsx#L1")
    expect(html).not.toContain('target="_blank"')
  })
})
