import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ThemeProvider } from "../hooks/useTheme"
import { HomepagePreferences } from "./HomepagePreferences"

describe("HomepagePreferences", () => {
  test("renders theme options, provider options, and ui identity", () => {
    const html = renderToStaticMarkup(
      <ThemeProvider>
        <HomepagePreferences />
      </ThemeProvider>
    )

    expect(html).toContain('data-ui-id="home.preferences"')
    expect(html).toContain('data-ui-c3="c3-117"')

    // Theme segment
    expect(html).toContain("Theme")
    expect(html).toContain("light")
    expect(html).toContain("dark")
    expect(html).toContain("system")

    // Provider segment
    expect(html).toContain("Default provider")
    expect(html).toContain("Last used")
    expect(html).toContain("Claude")
    expect(html).toContain("Codex")
  })
})
