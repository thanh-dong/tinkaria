import { describe, test, expect } from "bun:test"
import { unified } from "unified"
import remarkParse from "remark-parse"
import { remarkRichContentHint } from "./remarkRichContentHint"

describe("remarkRichContentHint", () => {
  test("annotates code block after autoExpand comment", () => {
    const md = `<!-- richcontent: autoExpand -->\n\n\`\`\`typescript\nconst x = 1\n\`\`\``
    const parsed = unified().use(remarkParse).parse(md)
    unified().use(remarkRichContentHint).runSync(parsed)

    // Find the code node
    const codeNode = parsed.children.find(
      (n: { type: string }) => n.type === "code"
    ) as { type: string; data?: { hProperties?: { "data-auto-expand"?: string } } } | undefined

    expect(codeNode).toBeDefined()
    expect(codeNode?.data?.hProperties?.["data-auto-expand"]).toBe("true")
  })

  test("does not annotate when comment is absent", () => {
    const md = "```typescript\nconst x = 1\n```"
    const parsed = unified().use(remarkParse).parse(md)
    unified().use(remarkRichContentHint).runSync(parsed)

    const codeNode = parsed.children.find(
      (n: { type: string }) => n.type === "code"
    ) as { type: string; data?: { hProperties?: Record<string, string> } } | undefined

    expect(codeNode?.data?.hProperties?.["data-auto-expand"]).toBeUndefined()
  })

  test("removes the comment node from the tree", () => {
    const md = `<!-- richcontent: autoExpand -->\n\n\`\`\`typescript\nconst x = 1\n\`\`\``
    const parsed = unified().use(remarkParse).parse(md)
    unified().use(remarkRichContentHint).runSync(parsed)

    const htmlNodes = parsed.children.filter(
      (n: { type: string }) => n.type === "html"
    )
    expect(htmlNodes).toHaveLength(0)
  })
})
