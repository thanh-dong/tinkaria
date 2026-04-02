import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { UserMessage } from "./UserMessage"

describe("UserMessage", () => {
  test("uses normal word breaking for short prompts instead of aggressive mid-word wrapping", () => {
    const html = renderToStaticMarkup(<UserMessage content={"short line"} />)

    expect(html).toContain("break-normal")
    expect(html).toContain("[overflow-wrap:break-word]")
  })
})
