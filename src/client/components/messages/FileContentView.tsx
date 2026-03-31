import { memo, useMemo } from "react"
import { diffLines as jsdiffLines } from "diff"
import type { Change } from "diff"

interface FileContentViewProps {
  content: string
  isDiff?: boolean
  oldString?: string
  newString?: string
}

interface ParsedLine {
  lineNumber: number | null
  content: string
}

interface DiffLine {
  type: "context" | "removed" | "added"
  content: string
}

// Parse content and extract line numbers if they match the pattern: N→content
function parseContent(content: string): ParsedLine[] {
  const lines = content.split("\n")
  const lineNumberPattern = /^\s*(\d+)→(.*)$/

  return lines.map((line) => {
    const match = line.match(lineNumberPattern)
    if (match) {
      return {
        lineNumber: parseInt(match[1], 10),
        content: match[2],
      }
    }
    return {
      lineNumber: null,
      content: line,
    }
  })
}

// Strip XML-like tags from content
function stripXmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, "")
}

// Compute unified diff using jsdiff Myers algorithm (O(n+d) vs old O(m×n) LCS)
export function computeUnifiedDiff(oldStr: string, newStr: string): DiffLine[] {
  if (oldStr === "" && newStr === "") return []

  const changes: Change[] = jsdiffLines(oldStr, newStr)
  const result: DiffLine[] = []

  for (const change of changes) {
    const type: DiffLine["type"] = change.added ? "added" : change.removed ? "removed" : "context"
    const prefix = change.added ? "+" : change.removed ? "-" : " "

    // Split value into lines, dropping the trailing empty string from final newline
    const lines = change.value.endsWith("\n")
      ? change.value.slice(0, -1).split("\n")
      : change.value.split("\n")

    for (const line of lines) {
      result.push({ type, content: `${prefix}${line}` })
    }
  }

  return result
}

export const FileContentView = memo(function FileContentView({ content, isDiff = false, oldString, newString }: FileContentViewProps) {
  // Diff mode
  const diffLines = useMemo(() => {
    if (isDiff && oldString !== undefined && newString !== undefined) {
      return computeUnifiedDiff(oldString, newString)
    }
    return []
  }, [isDiff, oldString, newString])

  // Text mode with line numbers
  const parsedLines = useMemo(() => {
    if (!isDiff) {
      return parseContent(content)
    }
    return []
  }, [content, isDiff])

  const hasLineNumbers = useMemo(() => {
    return parsedLines.some((line) => line.lineNumber !== null)
  }, [parsedLines])

  // Diff rendering
  if (isDiff && diffLines.length > 0) {
    return (
      <div className="my-1 rounded-lg border border-border overflow-hidden">
        <div className="overflow-auto max-h-64 md:max-h-[50vh]">
          <table className="w-full border-collapse text-xs font-mono">
            <tbody>
              {diffLines.map((line, i) => {
                const bg =
                  line.type === "removed"
                    ? "bg-red-500/10 dark:bg-red-500/15"
                    : line.type === "added"
                      ? "bg-green-500/10 dark:bg-green-500/15"
                      : ""

                const textColor =
                  line.type === "removed"
                    ? "text-red-700 dark:text-red-400"
                    : line.type === "added"
                      ? "text-green-700 dark:text-green-400"
                      : "text-foreground"

                return (
                  <tr key={i} className={bg}>
                    <td className={`px-2 py-0 select-none w-0 whitespace-nowrap ${line.type === "removed" ? "text-red-500/50" : line.type === "added" ? "text-green-500/50" : "text-muted-foreground/50"}`}>
                      {line.type === "removed" ? "-" : line.type === "added" ? "+" : " "}
                    </td>
                    <td className={`px-2 py-0 whitespace-pre select-all ${textColor}`}>
                      {line.content.slice(1)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Text rendering with optional line numbers
  return (
    <div className="my-1 rounded-lg border border-border overflow-hidden">
      <div className="overflow-auto max-h-64 md:max-h-[50vh]">
        <table className="w-full border-collapse text-xs font-mono">
          <tbody>
            {parsedLines.map((line, i) => (
              <tr key={i}>
                {hasLineNumbers && (
                  <td className="px-2 py-0 select-none w-0 whitespace-nowrap text-muted-foreground/50 text-right">
                    {line.lineNumber !== null ? line.lineNumber : ""}
                  </td>
                )}
                <td className="px-2 py-0 whitespace-pre select-all text-foreground">
                  {stripXmlTags(line.content)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
})
