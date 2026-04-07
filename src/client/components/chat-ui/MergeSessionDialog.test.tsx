import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  MergeSessionDialog,
  getMergeSessionUiIdentities,
  getMergeSessionUiIdentityDescriptors,
} from "./MergeSessionDialog"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { PROVIDERS, type SidebarChatRow } from "../../../shared/types"
import { DEFAULT_MERGE_PRESET_ID, getMergePreset } from "../../../shared/merge-presets"

const SAMPLE_CHATS: SidebarChatRow[] = [
  {
    _id: "row-1",
    _creationTime: Date.now() - 3600_000,
    chatId: "chat-aaa",
    title: "Fix login bug",
    status: "idle",
    localPath: "/project",
    provider: "claude",
    lastMessageAt: Date.now() - 3600_000,
    hasAutomation: false,
  },
  {
    _id: "row-2",
    _creationTime: Date.now() - 7200_000,
    chatId: "chat-bbb",
    title: "Refactor auth module",
    status: "running",
    localPath: "/project",
    provider: "codex",
    lastMessageAt: Date.now() - 7200_000,
    hasAutomation: false,
  },
  {
    _id: "row-3",
    _creationTime: Date.now() - 10800_000,
    chatId: "chat-ccc",
    title: "Add unit tests",
    status: "idle",
    localPath: "/project",
    provider: "claude",
    lastMessageAt: Date.now() - 10800_000,
    hasAutomation: false,
  },
]

describe("MergeSessionDialog", () => {
  test("renders without crashing when open", () => {
    renderToStaticMarkup(
      <MergeSessionDialog
        open={true}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        availableChats={SAMPLE_CHATS}
        onMerge={async () => {}}
      />,
    )
  })

  test("exposes semantic ui identities while open", () => {
    expect(getMergeSessionUiIdentities()).toEqual({
      dialog: "chat.merge-session.dialog",
      sessionsList: "chat.merge-session.sessions.list",
      sessionsSearchInput: "chat.merge-session.sessions.search.input",
      contextInput: "chat.merge-session.context.input",
      submitAction: "chat.merge-session.submit.action",
      cancelAction: "chat.merge-session.cancel.action",
      providerAction: "chat.merge-session.provider.action",
      providerPopover: "chat.merge-session.provider.popover",
      modelAction: "chat.merge-session.model.action",
      modelPopover: "chat.merge-session.model.popover",
      presetAction: "chat.merge-session.preset.action",
      presetPopover: "chat.merge-session.preset.popover",
    })
  })

  test("backs merge-session grab targets with C3-owned descriptors", () => {
    const descriptors = getMergeSessionUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.dialog)).toEqual({
      "data-ui-id": "chat.merge-session.dialog",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
    expect(getUiIdentityAttributeProps(descriptors.submitAction)).toEqual({
      "data-ui-id": "chat.merge-session.submit.action",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
    expect(getUiIdentityAttributeProps(descriptors.presetAction)).toEqual({
      "data-ui-id": "chat.merge-session.preset.action",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
    expect(getUiIdentityAttributeProps(descriptors.sessionsList)).toEqual({
      "data-ui-id": "chat.merge-session.sessions.list",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
  })

  test("uses a non-empty default preset scaffold", () => {
    const preset = getMergePreset(DEFAULT_MERGE_PRESET_ID)
    expect(preset).not.toBeNull()
    expect(preset?.defaultIntent.length ?? 0).toBeGreaterThan(20)
  })

  test("does not render dialog content when closed", () => {
    const html = renderToStaticMarkup(
      <MergeSessionDialog
        open={false}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        availableChats={SAMPLE_CHATS}
        onMerge={async () => {}}
      />,
    )

    expect(html).not.toContain("Merge sessions")
    expect(html).not.toContain("Create Session")
  })
})
