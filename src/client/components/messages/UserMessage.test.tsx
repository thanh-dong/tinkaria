import { describe, expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { copyUserPromptToClipboard, UserMessage } from "./UserMessage"

describe("UserMessage", () => {
  test("uses normal word breaking for short prompts instead of aggressive mid-word wrapping", () => {
    const html = renderToStaticMarkup(<UserMessage content={"short line"} />)

    expect(html).toContain("break-normal")
    expect(html).toContain("[overflow-wrap:break-word]")
  })

  test("renders a copy button for the user prompt bubble", () => {
    const html = renderToStaticMarkup(<UserMessage content={"copy me"} />)

    expect(html).toContain('aria-label="Copy prompt"')
    expect(html).toContain("opacity-0")
    expect(html).toContain("group-hover/user-message:opacity-100")
  })

  test("copies the normalized prompt content when clipboard access succeeds", async () => {
    const writeText = mock(() => Promise.resolve())

    await expect(copyUserPromptToClipboard("copy me", { writeText })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("copy me")
  })

  test("reports clipboard failure without throwing", async () => {
    const writeText = mock(() => Promise.reject(new Error("blocked")))

    await expect(copyUserPromptToClipboard("copy me", { writeText })).resolves.toBe(false)
    expect(writeText).toHaveBeenCalledWith("copy me")
  })
})
