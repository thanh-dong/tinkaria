import { afterEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PROVIDERS } from "../../../shared/types"
import { useSkillCompositionStore } from "../../stores/skillCompositionStore"
import { ChatInput } from "./ChatInput"

describe("ChatInput", () => {
  afterEach(() => {
    useSkillCompositionStore.setState({
      usageCounts: {},
      ribbonVisible: true,
    })
  })

  test("keeps the skill chips above the composer while moving the Skills toggle into the bottom bar", () => {
    useSkillCompositionStore.setState({
      usageCounts: {},
      ribbonVisible: true,
    })

    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={async () => "sent"}
        disabled={false}
        canCancel={false}
        activeProvider={null}
        availableProviders={PROVIDERS}
        availableSkills={["c3"]}
      />
    )

    const skillChipIndex = html.indexOf("/c3")
    const placeholderIndex = html.indexOf("Build something...")
    const skillsToggleIndex = html.indexOf(">Skills<")

    expect(skillChipIndex).toBeGreaterThan(-1)
    expect(placeholderIndex).toBeGreaterThan(-1)
    expect(skillsToggleIndex).toBeGreaterThan(-1)
    expect(skillChipIndex).toBeLessThan(placeholderIndex)
    expect(skillsToggleIndex).toBeGreaterThan(placeholderIndex)
  })
})
