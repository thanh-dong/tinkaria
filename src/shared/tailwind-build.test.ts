import { describe, expect, test } from "bun:test"

const INDEX_CSS_PATH = new URL("../index.css", import.meta.url)

describe("tailwind build entry", () => {
  test('constrains Tailwind source scanning to the app source tree', async () => {
    const css = await Bun.file(INDEX_CSS_PATH).text()

    expect(css).toContain('@import "tailwindcss" source(".");')
    expect(css).not.toContain('@import "tailwindcss";')
  })
})
