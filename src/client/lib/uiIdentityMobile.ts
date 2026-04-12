import { UI_IDENTITY_ATTRIBUTE, UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE } from "./uiIdentityOverlay"

export const FAB_POSITION_STORAGE_KEY = "ui-identity-fab-position"
export const UI_IDENTITY_FAB_ATTRIBUTE = "data-ui-identity-fab"

export interface FabPosition {
  right: number
  bottom: number
}

export const DEFAULT_FAB_POSITION: FabPosition = { right: 12, bottom: 12 }

export function isTouchDevice(
  matchMedia: typeof window.matchMedia = window.matchMedia,
): boolean {
  return matchMedia("(pointer: coarse)").matches
}

export function findNearestUiIdentityElement(target: Element): Element | null {
  if (target.getAttribute(UI_IDENTITY_ATTRIBUTE)) {
    return target
  }
  return target.closest(`[${UI_IDENTITY_ATTRIBUTE}]`)
}

export function shouldInterceptMobileTap(target: Element): boolean {
  if (target.closest(`[${UI_IDENTITY_OVERLAY_ROOT_ATTRIBUTE}="true"]`)) {
    return false
  }
  if (target.closest(`[${UI_IDENTITY_FAB_ATTRIBUTE}="true"]`)) {
    return false
  }
  return target.closest(`[${UI_IDENTITY_ATTRIBUTE}]`) !== null
}

export function getStoredFabPosition(
  storage: Storage = localStorage,
): FabPosition | null {
  try {
    const raw = storage.getItem(FAB_POSITION_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "right" in parsed &&
      "bottom" in parsed &&
      typeof (parsed as FabPosition).right === "number" &&
      typeof (parsed as FabPosition).bottom === "number"
    ) {
      return parsed as FabPosition
    }
    return null
  } catch (_e) {
    return null
  }
}

export function storeFabPosition(
  position: FabPosition,
  storage: Storage = localStorage,
): void {
  storage.setItem(FAB_POSITION_STORAGE_KEY, JSON.stringify(position))
}
