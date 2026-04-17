import { describe, expect, test } from "bun:test"
import {
  codexServiceTierFromModelOptions,
  normalizeClaudeModelOptions,
  normalizeCodexModelOptions,
  normalizeServerModel,
  deriveServerProviderCatalog,
  SERVER_PROVIDERS,
} from "./provider-catalog"
import { resolveClaudeApiModelId } from "../shared/types"
import type { RuntimeCapabilities, DiscoveredModel } from "../shared/runtime-types"

describe("provider catalog normalization", () => {
  test("maps legacy Claude effort into shared model options", () => {
    expect(normalizeClaudeModelOptions("opus", undefined, "max")).toEqual({
      reasoningEffort: "max",
      contextWindow: "200k",
    })
  })

  test("normalizes Claude context window only for supported models", () => {
    expect(normalizeClaudeModelOptions("sonnet", {
      claude: {
        reasoningEffort: "medium",
        contextWindow: "1m",
      },
    })).toEqual({
      reasoningEffort: "medium",
      contextWindow: "1m",
    })

    expect(normalizeClaudeModelOptions("haiku", {
      claude: {
        reasoningEffort: "medium",
        contextWindow: "1m",
      },
    })).toMatchObject({
      reasoningEffort: "medium",
    })
  })

  test("normalizes Codex model options and fast mode defaults", () => {
    expect(normalizeCodexModelOptions(undefined)).toEqual({
      reasoningEffort: "high",
      fastMode: false,
    })

    const normalized = normalizeCodexModelOptions({
      codex: {
        reasoningEffort: "xhigh",
        fastMode: true,
      },
    })

    expect(normalized).toEqual({
      reasoningEffort: "xhigh",
      fastMode: true,
    })
    expect(codexServiceTierFromModelOptions(normalized)).toBe("fast")
  })

  test("resolves Claude API model ids for 1m context window", () => {
    expect(resolveClaudeApiModelId("opus", "1m")).toBe("opus[1m]")
    expect(resolveClaudeApiModelId("sonnet", "200k")).toBe("sonnet")
  })
})

const DISCOVERED_MODELS: DiscoveredModel[] = [
  {
    value: "default",
    displayName: "Default (recommended)",
    description: "Opus 4.6 with 1M context",
    supportsEffort: true,
    supportedEffortLevels: ["low", "medium", "high", "max"],
    supportsFastMode: true,
    supportsAutoMode: true,
  },
  {
    value: "sonnet",
    displayName: "Sonnet",
    description: "Sonnet 4.6 · Best for everyday tasks",
    supportsEffort: true,
    supportedEffortLevels: ["low", "medium", "high"],
    supportsAutoMode: true,
  },
  {
    value: "haiku",
    displayName: "Haiku",
    description: "Haiku 4.5 · Fastest for quick answers",
  },
]

function makeCapabilities(models: DiscoveredModel[] = DISCOVERED_MODELS): RuntimeCapabilities {
  return { models, probedAt: Date.now(), runtimeVersion: "1.0.0" }
}

describe("deriveServerProviderCatalog", () => {
  test("returns static SERVER_PROVIDERS when no capabilities", () => {
    const result = deriveServerProviderCatalog()
    expect(result).toEqual(SERVER_PROVIDERS)
  })

  test("returns static SERVER_PROVIDERS when capabilities have empty models", () => {
    const result = deriveServerProviderCatalog(makeCapabilities([]))
    expect(result).toEqual(SERVER_PROVIDERS)
  })

  test("enriches static Claude models with discovered description and effort levels", () => {
    const result = deriveServerProviderCatalog(makeCapabilities())
    const claude = result.find((p) => p.id === "claude")!
    const sonnet = claude.models.find((m) => m.id === "sonnet")!
    expect(sonnet.description).toBe("Sonnet 4.6 · Best for everyday tasks")
    expect(sonnet.supportedEffortLevels).toEqual(["low", "medium", "high"])
  })

  test("maps 'default' discovered model to static 'opus' entry", () => {
    const result = deriveServerProviderCatalog(makeCapabilities())
    const claude = result.find((p) => p.id === "claude")!
    const opus = claude.models.find((m) => m.id === "opus")!
    expect(opus.description).toBe("Opus 4.6 with 1M context")
    expect(opus.supportedEffortLevels).toEqual(["low", "medium", "high", "max"])
  })

  test("appends discovered models not in static list", () => {
    const extraModel: DiscoveredModel = {
      value: "claude-opus-4-7",
      displayName: "Opus 4",
      description: "Newer version available",
    }
    const result = deriveServerProviderCatalog(makeCapabilities([...DISCOVERED_MODELS, extraModel]))
    const claude = result.find((p) => p.id === "claude")!
    const extra = claude.models.find((m) => m.id === "claude-opus-4-7")
    expect(extra).toBeDefined()
    expect(extra!.description).toBe("Newer version available")
    expect(extra!.label).toBe("Opus 4")
  })

  test("preserves static model order — static first, discovered extras appended", () => {
    const extraModel: DiscoveredModel = {
      value: "claude-opus-4-7",
      displayName: "Opus 4",
      description: "Newer version",
    }
    const result = deriveServerProviderCatalog(makeCapabilities([...DISCOVERED_MODELS, extraModel]))
    const claude = result.find((p) => p.id === "claude")!
    const ids = claude.models.map((m) => m.id)
    expect(ids).toEqual(["opus", "sonnet", "haiku", "claude-opus-4-7"])
  })

  test("codex is always static regardless of capabilities", () => {
    const result = deriveServerProviderCatalog(makeCapabilities())
    const codex = result.find((p) => p.id === "codex")!
    const staticCodex = SERVER_PROVIDERS.find((p) => p.id === "codex")!
    expect(codex).toEqual(staticCodex)
  })
})

describe("normalizeServerModel with dynamic catalog", () => {
  test("accepts full model id when present in dynamic catalog", () => {
    const extraModel: DiscoveredModel = {
      value: "claude-opus-4-7",
      displayName: "Opus 4",
      description: "Newer version",
    }
    const catalog = deriveServerProviderCatalog(makeCapabilities([...DISCOVERED_MODELS, extraModel]))
    expect(normalizeServerModel("claude", "claude-opus-4-7", catalog)).toBe("claude-opus-4-7")
  })

  test("falls back to default model when model not in catalog", () => {
    const catalog = deriveServerProviderCatalog(makeCapabilities())
    expect(normalizeServerModel("claude", "nonexistent", catalog)).toBe("sonnet")
  })

  test("uses static catalog by default (backward compat)", () => {
    expect(normalizeServerModel("claude", "sonnet")).toBe("sonnet")
  })
})
