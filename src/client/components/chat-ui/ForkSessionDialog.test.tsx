import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
  ForkSessionDialog,
  getForkSessionUiIdentities,
  getForkSessionUiIdentityDescriptors,
} from "./ForkSessionDialog"
import { getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { PROVIDERS } from "../../../shared/types"

describe("ForkSessionDialog", () => {
  test("renders without crashing when open", () => {
    // Radix Dialog uses a portal so SSR won't include dialog content — just verify no throw
    renderToStaticMarkup(
      <ForkSessionDialog
        open={true}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        onFork={async () => {}}
      />,
    )
  })

  test("exposes semantic ui identities while open", () => {
    expect(getForkSessionUiIdentities()).toEqual({
      dialog: "chat.fork-session.dialog",
      contextInput: "chat.fork-session.context.input",
      submitAction: "chat.fork-session.submit.action",
      cancelAction: "chat.fork-session.cancel.action",
      providerAction: "chat.fork-session.provider.action",
      providerPopover: "chat.fork-session.provider.popover",
      modelAction: "chat.fork-session.model.action",
      modelPopover: "chat.fork-session.model.popover",
    })
  })

  test("backs fork-session grab targets with C3-owned descriptors", () => {
    const descriptors = getForkSessionUiIdentityDescriptors()

    expect(getUiIdentityAttributeProps(descriptors.dialog)).toEqual({
      "data-ui-id": "chat.fork-session.dialog",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
    expect(getUiIdentityAttributeProps(descriptors.submitAction)).toEqual({
      "data-ui-id": "chat.fork-session.submit.action",
      "data-ui-c3": "c3-110",
      "data-ui-c3-label": "chat",
    })
  })

  test("does not render dialog content when closed", () => {
    const html = renderToStaticMarkup(
      <ForkSessionDialog
        open={false}
        onOpenChange={() => {}}
        defaultProvider="claude"
        defaultModel="sonnet"
        availableProviders={PROVIDERS}
        onFork={async () => {}}
      />,
    )

    expect(html).not.toContain("Fork session")
    expect(html).not.toContain("Create Session")
  })
})
