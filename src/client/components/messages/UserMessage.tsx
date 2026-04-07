import { memo, useMemo } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { createMarkdownComponents } from "./shared"
import { parseSkillsFromContent } from "../../stores/skillCompositionStore"
import { SkillBadgesReadonly } from "../chat-ui/SkillBadges"

interface Props {
  content: string
}

export const UserMessage = memo(function UserMessage({ content }: Props) {
  const userPromptDescriptor = createUiIdentityDescriptor({
    id: "message.user.prompt",
    c3ComponentId: "c3-111",
    c3ComponentLabel: "transcript-surfaces",
  })
  const parsed = useMemo(() => parseSkillsFromContent(content), [content])

  return (
    <div
      className="flex flex-col items-end gap-1.5"
      {...getUiIdentityAttributeProps(userPromptDescriptor)}
    >
      {parsed.skills ? (
        <SkillBadgesReadonly skills={parsed.skills} />
      ) : null}
      <div className="flex gap-2 justify-end">
        <div className="max-w-[85%] sm:max-w-[80%] rounded-[20px] py-1.5 px-3.5 bg-muted text-primary border border-border prose prose-sm prose-invert break-normal [overflow-wrap:break-word] [&_p]:whitespace-pre-line [&_p]:break-normal [&_p]:[overflow-wrap:break-word]">
          <Markdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents()}>{parsed.content}</Markdown>
        </div>
      </div>
    </div>
  )
})
