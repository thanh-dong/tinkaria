import { afterEach, describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PROVIDERS } from "../../../shared/types"
import { useSkillCompositionStore } from "../../stores/skillCompositionStore"
import { areChatInputPropsEqual, ChatInput } from "./ChatInput"

describe("ChatInput", () => {
  afterEach(() => {
    useSkillCompositionStore.setState({
      usageCounts: {},
      ribbonVisible: true,
    })
  })

  test("keeps the skill chips above the composer while placing the Skills toggle beside model selection", () => {
    useSkillCompositionStore.setState({
      usageCounts: {},
      ribbonVisible: true,
    })

    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={async () => "sent"}
        disabled={false}
        canCancel={false}
        connectionStatus="connected"
        activeProvider={null}
        availableProviders={PROVIDERS}
        availableSkills={["c3"]}
      />
    )

    const skillChipIndex = html.indexOf("/c3")
    const placeholderIndex = html.indexOf("Build something...")
    const modelIndex = html.indexOf("Opus")
    const skillsToggleIndex = html.indexOf(">Skills<")

    expect(skillChipIndex).toBeGreaterThan(-1)
    expect(placeholderIndex).toBeGreaterThan(-1)
    expect(modelIndex).toBeGreaterThan(placeholderIndex)
    expect(skillsToggleIndex).toBeGreaterThan(-1)
    expect(skillChipIndex).toBeLessThan(placeholderIndex)
    expect(skillsToggleIndex).toBeGreaterThan(modelIndex)
  })

  test("renders reconnect feedback inside the composer area instead of the transcript surface", () => {
    const html = renderToStaticMarkup(
      <ChatInput
        onSubmit={async () => "sent"}
        disabled={false}
        canCancel={false}
        connectionStatus="connecting"
        activeProvider={null}
        availableProviders={PROVIDERS}
      />
    )

    expect(html).toContain("Reconnecting")
    expect(html).toContain("text-amber-600")
    expect(html).toContain("border-amber-400/30")
    expect(html).not.toContain("transcript.message-list")
  })

  test("ignores callback identity churn when composer inputs are otherwise unchanged", () => {
    expect(areChatInputPropsEqual({
      onSubmit: async () => "sent",
      onCancel: () => {},
      queuedText: "",
      onClearQueuedText: () => {},
      onRestoreQueuedText: () => "",
      disabled: false,
      canCancel: false,
      chatId: "chat-1",
      connectionStatus: "connected",
      activeProvider: "codex",
      runtimeModel: "gpt-5.4",
      availableProviders: PROVIDERS,
      availableSkills: ["c3", "adapt"],
    }, {
      onSubmit: async () => "queued",
      onCancel: () => {},
      queuedText: "",
      onClearQueuedText: () => {},
      onRestoreQueuedText: () => "",
      disabled: false,
      canCancel: false,
      chatId: "chat-1",
      connectionStatus: "connected",
      activeProvider: "codex",
      runtimeModel: "gpt-5.4",
      availableProviders: PROVIDERS.map((provider) => ({
        ...provider,
        models: provider.models.map((model) => ({
          ...model,
          contextWindowOptions: model.contextWindowOptions ? [...model.contextWindowOptions] : undefined,
        })),
      })),
      availableSkills: ["c3", "adapt"],
    })).toBe(true)
  })
})
