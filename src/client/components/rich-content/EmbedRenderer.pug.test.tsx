import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { EmbedRenderer, isEmbedLanguage } from "./EmbedRenderer"
import { ContentViewerContext, type ContentViewerContextValue } from "./ContentViewerContext"

describe("EmbedRenderer pug embed", () => {
  test("treats pug as an embed language", () => {
    expect(isEmbedLanguage("pug")).toBe(true)
  })

  test("renders pug source through the sandboxed html embed path", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer
        format="pug"
        source={[
          "main",
          "  h1 Hello",
          "  p Uses safe compiled markup",
        ].join("\n")}
      />,
    )

    expect(html).toContain("srcDoc")
    expect(html).toContain("&lt;main&gt;&lt;h1&gt;Hello&lt;/h1&gt;&lt;p&gt;Uses safe compiled markup&lt;/p&gt;&lt;/main&gt;")
    expect(html).toContain('sandbox="allow-scripts"')
    expect(html).not.toContain("Pug render error")
  })

  test("shows diagnostics and raw source when pug rendering fails", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer format="pug" source="script alert(1)" />,
    )

    expect(html).toContain("Pug render error")
    expect(html).toContain("PUGGY_UNSAFE_TAG")
    expect(html).toContain("script alert(1)")
    expect(html).not.toContain("srcDoc")
  })

  test("renders full-pug document noise by omitting non-visual tags", () => {
    const html = renderToStaticMarkup(
      <EmbedRenderer
        format="pug"
        source={[
          "doctype html",
          "html(lang=\"en\")",
          "  head",
          "    meta(charset=\"UTF-8\")",
          "    style.",
          "      :root { --t1: #6366f1; }",
          "  body",
          "    h1(style=\"color: var(--t1)\") Hello",
        ].join("\n")}
      />,
    )

    expect(html).toContain("srcDoc")
    expect(html).toContain("&lt;style&gt;:root { --t1: #6366f1; }&lt;/style&gt;")
    expect(html).toContain("&lt;h1 style=&quot;color: var(--t1)&quot;&gt;Hello&lt;/h1&gt;")
    expect(html).not.toContain("Pug render error")
    expect(html).not.toContain("&lt;meta")
  })

  test("shows original pug source in source mode", () => {
    const ctx: ContentViewerContextValue = {
      state: { type: "embed", renderMode: "source", zoom: 1 },
      dispatch: () => {},
    }
    const source = "main\n  h1 Hello"
    const html = renderToStaticMarkup(
      <ContentViewerContext.Provider value={ctx}>
        <EmbedRenderer format="pug" source={source} />
      </ContentViewerContext.Provider>,
    )

    expect(html).not.toContain("srcDoc")
    expect(html).toContain("main")
    expect(html).toContain("h1 Hello")
    expect(html).not.toContain("&lt;main&gt;&lt;h1&gt;Hello&lt;/h1&gt;&lt;/main&gt;")
  })
})
