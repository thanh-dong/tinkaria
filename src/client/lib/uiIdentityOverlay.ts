export const UI_IDENTITY_ATTRIBUTE = "data-ui-id"
export const UI_IDENTITY_C3_ATTRIBUTE = "data-ui-c3"
export const UI_IDENTITY_C3_LABEL_ATTRIBUTE = "data-ui-c3-label"

export type UiIdentityKind =
  | "area"
  | "item"
  | "action"
  | "menu"
  | "dialog"
  | "popover"
  | "section"

export interface UiIdentityModifierState {
  altKey: boolean
  shiftKey: boolean
}

export interface UiIdentityDescriptor {
  id: string
  c3ComponentId: string | null
  c3ComponentLabel: string | null
}

export type UiIdentityValue = string | UiIdentityDescriptor

export function createUiIdentity(base: string, kind: UiIdentityKind): string {
  return `${base}.${kind}`
}

export function createUiIdentityDescriptor(args: {
  id: string
  c3ComponentId?: string | null
  c3ComponentLabel?: string | null
}): UiIdentityDescriptor {
  return {
    id: args.id,
    c3ComponentId: args.c3ComponentId ?? null,
    c3ComponentLabel: args.c3ComponentLabel ?? null,
  }
}

export function createC3UiIdentityDescriptor(args: {
  id: string
  c3ComponentId: string
  c3ComponentLabel: string
}): UiIdentityDescriptor {
  return createUiIdentityDescriptor(args)
}

export function isUiIdentityOverlayActive(modifiers: UiIdentityModifierState): boolean {
  return modifiers.altKey && modifiers.shiftKey
}

export function formatCopiedUiIdentity(descriptor: UiIdentityDescriptor): string {
  if (!descriptor.c3ComponentId) {
    return descriptor.id
  }

  if (descriptor.c3ComponentLabel) {
    return `${descriptor.id} | c3:${descriptor.c3ComponentId}(${descriptor.c3ComponentLabel})`
  }

  return `${descriptor.id} | c3:${descriptor.c3ComponentId}`
}

export function getUiIdentityId(value: UiIdentityValue): string {
  return typeof value === "string" ? value : value.id
}

export function getUiIdentityIdMap<T extends Record<string, UiIdentityValue>>(values: T): { [K in keyof T]: string } {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, getUiIdentityId(value)])
  ) as { [K in keyof T]: string }
}

function isUiIdentityDescriptor(value: UiIdentityValue): value is UiIdentityDescriptor {
  return typeof value !== "string"
}

export function getUiIdentityDescriptorFromElement(element: Element): UiIdentityDescriptor | null {
  const id = element.getAttribute(UI_IDENTITY_ATTRIBUTE)
  if (!id) {
    return null
  }

  return createUiIdentityDescriptor({
    id,
    c3ComponentId: element.getAttribute(UI_IDENTITY_C3_ATTRIBUTE),
    c3ComponentLabel: element.getAttribute(UI_IDENTITY_C3_LABEL_ATTRIBUTE),
  })
}

export function getUiIdentityAttributeProps(
  idOrDescriptor: UiIdentityValue,
): {
  "data-ui-id": string
  "data-ui-c3"?: string
  "data-ui-c3-label"?: string
} {
  if (!isUiIdentityDescriptor(idOrDescriptor)) {
    return {
      [UI_IDENTITY_ATTRIBUTE]: idOrDescriptor,
    }
  }

  const props: {
    "data-ui-id": string
    "data-ui-c3"?: string
    "data-ui-c3-label"?: string
  } = {
    [UI_IDENTITY_ATTRIBUTE]: idOrDescriptor.id,
  }

  if (idOrDescriptor.c3ComponentId) {
    props[UI_IDENTITY_C3_ATTRIBUTE] = idOrDescriptor.c3ComponentId
  }

  if (idOrDescriptor.c3ComponentLabel) {
    props[UI_IDENTITY_C3_LABEL_ATTRIBUTE] = idOrDescriptor.c3ComponentLabel
  }

  return props
}

export function buildUiIdentityStack(target: Element | null, limit = 3): Element[] {
  if (!target || limit <= 0) {
    return []
  }

  const stack: Element[] = []
  let current: Element | null = target

  while (current && stack.length < limit) {
    const id = current.getAttribute(UI_IDENTITY_ATTRIBUTE)
    if (id) {
      stack.push(current)
    }
    current = current.parentElement
  }

  return stack
}
