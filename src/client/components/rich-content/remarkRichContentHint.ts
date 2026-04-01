import type { Root } from "mdast"

const HINT_PATTERN = /<!--\s*richcontent:\s*autoExpand\s*-->/

type NodeWithData = {
  data?: {
    hProperties?: Record<string, string>
  }
}

export function remarkRichContentHint() {
  return function transform(tree: Root) {
    const indicesToRemove: number[] = []

    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i]
      if (node.type !== "html") continue

      const htmlNode = node as { type: "html"; value: string }
      if (!HINT_PATTERN.test(htmlNode.value)) continue

      // Find next sibling that isn't another html comment
      const nextIndex = i + 1
      if (nextIndex < tree.children.length) {
        const next = tree.children[nextIndex] as NodeWithData
        next.data = next.data ?? {}
        next.data.hProperties = next.data.hProperties ?? {}
        next.data.hProperties["data-auto-expand"] = "true"
      }

      indicesToRemove.push(i)
    }

    // Remove comment nodes in reverse order to preserve indices
    for (let j = indicesToRemove.length - 1; j >= 0; j--) {
      tree.children.splice(indicesToRemove[j]!, 1)
    }
  }
}
