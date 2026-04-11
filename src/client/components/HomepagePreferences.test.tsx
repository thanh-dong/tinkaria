import { beforeEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ThemeProvider } from "../hooks/useTheme"
import { HomepagePreferences } from "./HomepagePreferences"

// Guard against prior tests wiping browser globals (order-dependent in full suite)
function ensureBrowserGlobals() {
  if (typeof globalThis.window !== "undefined") {
    if (!globalThis.window.matchMedia) {
      globalThis.window.matchMedia = (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList
    }
    if (!globalThis.window.localStorage) {
      const store = new Map<string, string>()
      Object.defineProperty(globalThis.window, "localStorage", {
        value: {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => store.set(k, v),
          removeItem: (k: string) => store.delete(k),
          clear: () => store.clear(),
          get length() { return store.size },
          key: (i: number) => [...store.keys()][i] ?? null,
        },
        writable: true, configurable: true,
      })
    }
  }
}
ensureBrowserGlobals()
beforeEach(ensureBrowserGlobals)

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
