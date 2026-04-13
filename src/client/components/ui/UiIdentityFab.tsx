import { useCallback, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Crosshair } from "lucide-react"
import {
  UI_IDENTITY_FAB_ATTRIBUTE,
  DEFAULT_FAB_POSITION,
  getStoredFabPosition,
  storeFabPosition,
  type FabPosition,
} from "../../lib/uiIdentityMobile"

export const UI_IDENTITY_FAB_SIZE_PX = 36
const FAB_Z_INDEX = 119

export function getFabStyle(position: FabPosition): Record<string, unknown> {
  return {
    position: "fixed" as const,
    right: position.right,
    bottom: position.bottom,
    width: UI_IDENTITY_FAB_SIZE_PX,
    height: UI_IDENTITY_FAB_SIZE_PX,
    zIndex: FAB_Z_INDEX,
  }
}

interface UiIdentityFabProps {
  active: boolean
  onToggle: () => void
}

export function UiIdentityFab(props: UiIdentityFabProps) {
  const [position, setPosition] = useState<FabPosition>(
    () => (typeof localStorage !== "undefined" ? getStoredFabPosition() : null) ?? DEFAULT_FAB_POSITION
  )
  const dragStateRef = useRef<{
    startX: number
    startY: number
    startRight: number
    startBottom: number
  } | null>(null)

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startRight: position.right,
      startBottom: position.bottom,
    }
  }, [position])

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag) return

    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    const newRight = Math.max(0, drag.startRight - deltaX)
    const newBottom = Math.max(0, drag.startBottom - deltaY)

    setPosition({ right: newRight, bottom: newBottom })
  }, [])

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    const drag = dragStateRef.current
    if (!drag) return
    dragStateRef.current = null

    const totalMovement = Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY)
    if (totalMovement < 5) {
      props.onToggle()
    } else {
      storeFabPosition(position)
    }
  }, [position, props.onToggle])

  const content = (
    <button
      type="button"
      {...{ [UI_IDENTITY_FAB_ATTRIBUTE]: "true" }}
      aria-label={props.active ? "Deactivate UI inspector" : "Activate UI inspector"}
      className="flex items-center justify-center rounded-full border border-border shadow-lg backdrop-blur-sm transition-colors"
      style={{
        ...getFabStyle(position),
        opacity: props.active ? 1 : 0.4,
        backgroundColor: props.active ? "rgb(14 165 233)" : "rgb(var(--background))",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <Crosshair
        size={18}
        className={props.active ? "text-white" : "text-muted-foreground"}
      />
    </button>
  )

  if (typeof document === "undefined" || !document.body) {
    return content
  }

  return createPortal(content, document.body)
}
