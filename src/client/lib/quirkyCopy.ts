interface PhraseSpec {
  frame: string
  parts?: readonly string[]
  literal?: string
}

function mergeWordParts(parts: readonly string[]): string {
  return parts.reduce((word, part) => {
    if (word.length === 0) return part
    if (part.length === 0) return word
    const previousChar = word.at(-1)
    const nextChar = part[0]
    if (previousChar && previousChar.toLowerCase() === nextChar.toLowerCase()) {
      return `${word}${part.slice(1)}`
    }
    return `${word}${part}`
  }, "")
}

export function composeQuirkyPhrase(spec: PhraseSpec): string {
  const phrase = spec.literal ?? mergeWordParts(spec.parts ?? [])
  return spec.frame.replace("%", phrase)
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (const char of seed) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function selectPhrase(pool: readonly string[], seed: string): string {
  return pool[hashSeed(seed) % pool.length]
}

function selectPhraseAtStep(pool: readonly string[], seed: string, step: number): string {
  const normalizedStep = Number.isFinite(step) ? Math.max(0, Math.trunc(step)) : 0
  return pool[(hashSeed(seed) + normalizedStep) % pool.length]
}

const EMPTY_STATE_SPECS = [
  { frame: "What are we %?", parts: ["tink", "ar", "ing"] },
  { frame: "What are we % up?", parts: ["scrom", "m", "ing"] },
  { frame: "What are we % today?", parts: ["sketch", "l", "ing"] },
  { frame: "What are we % together?", parts: ["patch", "l", "ing"] },
  { frame: "What are we %?", parts: ["mash", "craft", "ing"] },
  { frame: "What are we % on?", parts: ["spark", "er", "ing"] },
  { frame: "What are we % into shape?", parts: ["rigg", "l", "ing"] },
  { frame: "What are we % loose?", parts: ["puzz", "l", "ing"] },
  { frame: "What are we % together?", parts: ["clack", "l", "ing"] },
  { frame: "What are we % here?", parts: ["sprout", "ing"] },
] as const satisfies readonly PhraseSpec[]

const COMPOSER_PLACEHOLDER_SPECS = [
  { frame: "%...", parts: ["tink", "ar", "ing"] },
  { frame: "% something up...", parts: ["scrom", "m", "ing"] },
  { frame: "% time...", parts: ["sketch", "l", "ing"] },
  { frame: "% a plan...", parts: ["patch", "l", "e"] },
  { frame: "% a prompt...", parts: ["mash", "craft"] },
  { frame: "% up a weird little build...", parts: ["spark"] },
  { frame: "% something into place...", parts: ["rigg", "l", "e"] },
  { frame: "% a thought into motion...", parts: ["nudg", "e"] },
  { frame: "% a scrappy idea...", parts: ["spin"] },
  { frame: "%", literal: "Make a tiny glorious mess..." },
] as const satisfies readonly PhraseSpec[]

export const CHAT_EMPTY_STATE_POOL = EMPTY_STATE_SPECS.map(composeQuirkyPhrase)
export const CHAT_COMPOSER_PLACEHOLDER_POOL = COMPOSER_PLACEHOLDER_SPECS.map(composeQuirkyPhrase)

export function getChatEmptyStateText(chatId: string | null | undefined): string {
  return selectPhrase(CHAT_EMPTY_STATE_POOL, `${chatId ?? "default"}:empty-state`)
}

export function getChatComposerPlaceholderText(chatId: string | null | undefined): string {
  return selectPhrase(CHAT_COMPOSER_PLACEHOLDER_POOL, `${chatId ?? "default"}:composer-placeholder`)
}

export function getAwaitingChatComposerPlaceholderText(
  chatId: string | null | undefined,
  step: number
): string {
  return selectPhraseAtStep(
    CHAT_COMPOSER_PLACEHOLDER_POOL,
    `${chatId ?? "default"}:composer-placeholder`,
    step
  )
}
