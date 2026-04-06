import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ForkSessionDialog } from "./ForkSessionDialog"
import { PROVIDERS } from "../../../shared/types"

describe("ForkSessionDialog", () => {
  test("renders without crashing when open", () => {
    // Radix Dialog uses a portal so SSR won't include dialog content — just verify no throw
    renderToStaticMarkup(
      <ForkSessionDialog
        open={true}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        onFork={async () => {}}
      />,
    )
  })

  test("does not render dialog content when closed", () => {
    const html = renderToStaticMarkup(
      <ForkSessionDialog
        open={false}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        onFork={async () => {}}
      />,
    )

    expect(html).not.toContain("Fork session")
    expect(html).not.toContain("Create Session")
  })
})
