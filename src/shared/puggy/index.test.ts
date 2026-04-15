import { describe, expect, test } from "bun:test"
import { render } from "./index"

describe("puggy render", () => {
  test("renders nested Pug-style markup with escaped interpolation", () => {
    const result = render(
      [
        "section.card",
        "  h2 Hello #{name}",
        "  ul",
        "    each item in items",
        "      li= item",
      ].join("\n"),
      {
        name: "<Ada>",
        items: ["one", "two"],
      },
    )

    expect(result).toEqual({
      ok: true,
      html: '<section class="card"><h2>Hello &lt;Ada&gt;</h2><ul><li>one</li><li>two</li></ul></section>',
      diagnostics: [],
    })
  })

  test("rejects unsafe tags and attributes", () => {
    const tagResult = render("script alert(1)")
    const attrResult = render('button(onclick="alert(1)") Click')

    expect(tagResult.ok).toBe(false)
    expect(tagResult.diagnostics[0]?.code).toBe("PUGGY_UNSAFE_TAG")
    expect(attrResult.ok).toBe(false)
    expect(attrResult.diagnostics[0]?.code).toBe("PUGGY_UNSAFE_ATTR")
  })

  test("omits full-pug document noise while preserving css", () => {
    const result = render(
      [
        "doctype html",
        "html(lang=\"en\")",
        "  head",
        "    //- skipped comment",
        "    meta(charset=\"UTF-8\")",
        "    style.",
        "      :root {",
        "        --t1: #6366f1;",
        "      }",
        "  body",
        "    summary.tier-header(style=\"background: var(--t1)\")",
        "      h2 Tier 1",
        "    p: strong Insight: board can be trusted",
        "    .want #[strong see all work]",
      ].join("\n"),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.html).toContain("<style>:root {\n  --t1: #6366f1;\n}</style>")
    expect(result.html).toContain('<summary class="tier-header" style="background: var(--t1)">')
    expect(result.html).toContain("<p>Insight: board can be trusted</p>")
    expect(result.html).toContain('<div class="want">see all work</div>')
    expect(result.html).not.toContain("<meta")
    expect(result.html).not.toContain("skipped comment")
    expect(result.html).not.toContain("doctype")
  })

  test("preserves newlines in raw text blocks", () => {
    const result = render(["p.", "  first line", "  second line"].join("\n"))

    expect(result).toEqual({
      ok: true,
      html: "<p>first line\nsecond line</p>",
      diagnostics: [],
    })
  })
})
