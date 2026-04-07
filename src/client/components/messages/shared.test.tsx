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

  test("renders code blocks with sugar-high syntax highlighting", () => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {"```typescript\nconst x = 1\n```"}
      </Markdown>
    )

    // sugar-high wraps tokens in spans with sh__token classes and CSS var colors
    expect(html).toContain("sh__token--keyword")
    expect(html).toContain("var(--sh-keyword)")
  })

  test("routes fenced svg through embed rich content without syntax highlighting tokens", () => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {"```svg\n<svg viewBox=\"0 0 10 10\"><rect width=\"10\" height=\"10\" /></svg>\n```"}
      </Markdown>
    )

    expect(html).toContain("group/rich-content")
    expect(html).toContain("svg")
    expect(html).toContain("lucide-image")
    expect(html).not.toContain("lucide-code")
    expect(html).not.toContain("sh__token--")
  })

  test("renders inline code without aggressive per-character wrapping", () => {
    const html = renderToStaticMarkup(
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {"Use `$c3` here."}
      </Markdown>
    )

    expect(html).toContain("$c3")
    expect(html).toContain("break-normal")
    expect(html).toContain("[overflow-wrap:anywhere]")
    expect(html).not.toContain("break-all")
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

  test("clicking a local file link routes to the in-app preview handler", () => {
    const openedTargets: Array<{ path: string; line?: number; column?: number }> = []
    const components = createMarkdownComponents({
      onOpenExternalLink: () => false,
      onOpenLocalLink: (target) => {
        openedTargets.push(target)
      },
    })

    const anchor = components.a({
      href: "/Users/jake/Projects/kanna/src/client/app/App.tsx#L12C3",
      children: "app.ts",
    })
    const clickEvent = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }

    anchor.props.onClick(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(openedTargets).toEqual([
      {
        path: "/Users/jake/Projects/kanna/src/client/app/App.tsx",
        line: 12,
        column: 3,
      },
    ])
  })

  test("clicking a remote link routes to the desktop handler when intercepted", () => {
    const openedTargets: string[] = []
    const components = createMarkdownComponents({
      onOpenLocalLink: () => {},
      onOpenExternalLink: (href) => {
        openedTargets.push(href)
        return true
      },
    })

    const anchor = components.a({
      href: "https://example.com/demo",
      children: "demo",
    })
    const clickEvent = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }

    anchor.props.onClick(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(openedTargets).toEqual(["https://example.com/demo"])
  })

  test("clicking a remote link falls back to browser navigation when not intercepted", () => {
    const components = createMarkdownComponents({
      onOpenLocalLink: () => {},
      onOpenExternalLink: () => false,
    })

    const anchor = components.a({
      href: "https://example.com/demo",
      children: "demo",
    })
    const clickEvent = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true
      },
    }

    anchor.props.onClick(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(false)
    expect(anchor.props.target).toBe("_blank")
    expect(anchor.props.rel).toBe("noopener noreferrer")
  })

  test("local file links clear renderer-provided browser target props", () => {
    const components = createMarkdownComponents({
      onOpenLocalLink: () => {},
      onOpenExternalLink: () => false,
    })
    const anchor = components.a({
      href: "/Users/jake/Projects/kanna/src/client/app/App.tsx#L12C3",
      target: "_blank",
      rel: "noopener noreferrer",
      children: "app.ts",
    })

    expect(anchor.props.target).toBeUndefined()
    expect(anchor.props.rel).toBeUndefined()
  })
})
