import { describe, test, expect, mock } from "bun:test"
import type { AppTransport } from "./socket-interface"
import type { ProjectCoordinationSnapshot } from "../../shared/project-agent-types"
import type { SubscriptionTopic } from "../../shared/protocol"

describe("useProjectSubscription contract", () => {
  test("subscribes with correct topic shape", () => {
    const subscribeMock = mock(() => () => {})
    const fakeSocket: Pick<AppTransport, "subscribe"> = {
      subscribe: subscribeMock,
    }

    const projectId = "proj-123"
    const topic: SubscriptionTopic = { type: "project", projectId }

    fakeSocket.subscribe<ProjectCoordinationSnapshot>(topic, () => {})

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    const [calledTopic] = subscribeMock.mock.calls[0] as unknown as [SubscriptionTopic, unknown]
    expect(calledTopic).toEqual({ type: "project", projectId: "proj-123" })
  })

  test("unsubscribe function is returned", () => {
    const unsubMock = mock(() => {})
    const fakeSocket: Pick<AppTransport, "subscribe"> = {
      subscribe: mock(() => unsubMock),
    }

    const unsub = fakeSocket.subscribe<ProjectCoordinationSnapshot>(
      { type: "project", projectId: "proj-123" },
      () => {}
    )

    expect(typeof unsub).toBe("function")
    unsub()
    expect(unsubMock).toHaveBeenCalledTimes(1)
  })
})
