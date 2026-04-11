import { describe, test, expect, mock } from "bun:test"
import type { AppTransport } from "./socket-interface"
import type { WorkspaceCoordinationSnapshot } from "../../shared/workspace-types"
import type { SubscriptionTopic } from "../../shared/protocol"

describe("useWorkspaceSubscription contract", () => {
  test("subscribes with correct topic shape", () => {
    const subscribeMock = mock(() => () => {})
    const fakeSocket: Pick<AppTransport, "subscribe"> = {
      subscribe: subscribeMock,
    }

    const workspaceId = "proj-123"
    const topic: SubscriptionTopic = { type: "workspace", workspaceId }

    fakeSocket.subscribe<WorkspaceCoordinationSnapshot>(topic, () => {})

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    const [calledTopic] = subscribeMock.mock.calls[0] as unknown as [SubscriptionTopic, unknown]
    expect(calledTopic).toEqual({ type: "workspace", workspaceId: "proj-123" })
  })

  test("unsubscribe function is returned", () => {
    const unsubMock = mock(() => {})
    const fakeSocket: Pick<AppTransport, "subscribe"> = {
      subscribe: mock(() => unsubMock),
    }

    const unsub = fakeSocket.subscribe<WorkspaceCoordinationSnapshot>(
      { type: "workspace", workspaceId: "proj-123" },
      () => {}
    )

    expect(typeof unsub).toBe("function")
    unsub()
    expect(unsubMock).toHaveBeenCalledTimes(1)
  })
})
