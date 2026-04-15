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
})
