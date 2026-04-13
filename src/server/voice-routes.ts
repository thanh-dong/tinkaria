import { LOG_PREFIX } from "../shared/branding"
import {
  VOICE_SOURCE_LANGUAGES,
  VOICE_TARGET_LANGUAGES,
  type VoiceTranscribeResponse,
} from "../shared/types"

const VOICE_LOG = `${LOG_PREFIX} [voice]`

const OPENAI_WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"
const OPENAI_TRANSLATION_URL = "https://api.openai.com/v1/audio/translations"

/** Maximum audio file size: 25 MB (OpenAI Whisper limit). */
const MAX_AUDIO_SIZE = 25 * 1024 * 1024

/** Allowed audio MIME types for upload.
 *  Includes video/webm because Android MediaRecorder reports video/webm
 *  even for audio-only streams recorded from getUserMedia({ audio: true }). */
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "video/webm",
  "audio/wav",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/flac",
])

/** Allowlists built from shared types — used to validate language params server-side. */
const VALID_SOURCE_CODES = new Set(VOICE_SOURCE_LANGUAGES.map((l) => l.code))
const VALID_TARGET_CODES = new Set(VOICE_TARGET_LANGUAGES.map((l) => l.code))

// ── Rate Limiting ──

const RATE_LIMIT = 20
const RATE_WINDOW_MS = 60_000
const rateCounts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateCounts.get(ip)
  if (!entry || now > entry.resetAt) {
    rateCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// ── Helpers ──

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function errorResponse(error: string, code: number): Response {
  return jsonResponse({ error, code }, code)
}

function getOpenAIApiKey(): string | null {
  return process.env.OPENAI_API_KEY ?? null
}

function verifyAuth(req: Request, expectedToken: string): boolean {
  const header = req.headers.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null
  return token === expectedToken
}

/**
 * Normalize MIME type for Whisper. Android MediaRecorder reports video/webm
 * for audio-only streams — remap to audio/webm so Whisper handles it correctly.
 */
function normalizeAudioMime(mime: string): string {
  if (mime === "video/webm") return "audio/webm"
  return mime
}

/**
 * Resolve the file extension from a MIME type for Whisper's `file` field.
 * Whisper infers format from extension, so this matters.
 */
function extensionFromMime(mime: string): string {
  if (mime.includes("webm")) return "webm"
  if (mime.includes("wav")) return "wav"
  if (mime.includes("mp3") || mime.includes("mpeg")) return "mp3"
  if (mime.includes("mp4")) return "mp4"
  if (mime.includes("ogg")) return "ogg"
  if (mime.includes("flac")) return "flac"
  return "webm"
}

/**
 * Validate audio file magic bytes to prevent non-audio files
 * from being forwarded to Whisper even if MIME type is spoofed.
 */
async function validateAudioMagicBytes(file: File): Promise<boolean> {
  const header = await file.slice(0, 12).arrayBuffer()
  const bytes = new Uint8Array(header)
  if (bytes.length < 4) return false
  // WebM (EBML header)
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return true
  // RIFF/WAV
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true
  // OGG
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return true
  // FLAC
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return true
  // MP3 — frame sync
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return true
  // MP3 — ID3 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true
  // MP4 — ftyp box at offset 4
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return true
  return false
}

/**
 * Call OpenAI Whisper API for transcription (same-language) or translation (to English).
 */
async function callWhisperAPI(args: {
  apiKey: string
  audioBlob: Blob
  audioMime: string
  sourceLanguage: string
  translateToEnglish: boolean
}): Promise<{ text: string; language?: string }> {
  const { apiKey, audioBlob, audioMime, sourceLanguage, translateToEnglish } = args

  // Whisper's /translations endpoint always translates TO English.
  // For other target languages, we transcribe first and handle translation separately.
  const url = translateToEnglish ? OPENAI_TRANSLATION_URL : OPENAI_WHISPER_URL

  const ext = extensionFromMime(audioMime)
  const formData = new FormData()
  formData.append("file", new File([audioBlob], `recording.${ext}`, { type: audioMime }))
  formData.append("model", "whisper-1")
  formData.append("response_format", "verbose_json")

  // Only set language hint for transcription (not translation)
  if (!translateToEnglish && sourceLanguage !== "auto") {
    formData.append("language", sourceLanguage)
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const body = await response.text()
    // Truncate logged body to avoid leaking API key fragments from error messages
    console.warn(VOICE_LOG, `Whisper API error ${response.status}: ${body.slice(0, 200)}`)
    throw new Error(`Whisper API returned ${response.status}`)
  }

  const result = await response.json() as { text: string; language?: string }
  return { text: result.text, language: result.language }
}

/**
 * Determine whether to use Whisper's built-in translation endpoint.
 * Whisper can only translate TO English. For other target languages,
 * we transcribe in source language first (translation would need a separate LLM call).
 */
function shouldUseWhisperTranslation(sourceLanguage: string, targetLanguage: string, autoTranslate: boolean): boolean {
  if (!autoTranslate) return false
  if (targetLanguage !== "en") return false
  if (sourceLanguage === "en") return false
  return true
}

/**
 * Extract client IP from request for rate limiting.
 * Uses X-Forwarded-For if behind a proxy, falls back to a default.
 */
function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1"
}

export function createVoiceRouter(authToken: string): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/api\/voice/, "")

    // All voice endpoints require authentication
    if (!verifyAuth(req, authToken)) {
      return errorResponse("Unauthorized", 401)
    }

    // GET /api/voice/status — check if voice transcription is available
    if (req.method === "GET" && path === "/status") {
      const apiKey = getOpenAIApiKey()
      return jsonResponse({
        available: apiKey !== null,
        provider: apiKey ? "openai-whisper" : null,
      })
    }

    // POST /api/voice/transcribe — transcribe/translate audio
    if (req.method === "POST" && path === "/transcribe") {
      // Rate limit
      const clientIP = getClientIP(req)
      if (!checkRateLimit(clientIP)) {
        return errorResponse("Too many requests. Try again later.", 429)
      }

      const apiKey = getOpenAIApiKey()
      if (!apiKey) {
        return errorResponse(
          "Voice transcription not configured. Set OPENAI_API_KEY environment variable.",
          503
        )
      }

      const contentType = req.headers.get("content-type") ?? ""
      if (!contentType.includes("multipart/form-data")) {
        return errorResponse("Expected multipart/form-data", 400)
      }

      let formData: FormData
      try {
        formData = await req.formData()
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(VOICE_LOG, `Failed to parse form data: ${message}`)
        return errorResponse("Invalid form data", 400)
      }

      const audioFile = formData.get("audio")
      if (!audioFile || !(audioFile instanceof File)) {
        return errorResponse("Missing 'audio' file field", 400)
      }

      // Validate file size
      if (audioFile.size > MAX_AUDIO_SIZE) {
        return errorResponse(`Audio file too large (max ${MAX_AUDIO_SIZE / 1024 / 1024}MB)`, 413)
      }

      // Validate MIME type (client-supplied, first check)
      const audioMime = audioFile.type || "audio/webm"
      const baseMime = audioMime.split(";")[0].trim()
      if (!ALLOWED_AUDIO_TYPES.has(baseMime)) {
        return errorResponse(`Unsupported audio type: ${baseMime}`, 415)
      }

      // Validate magic bytes (server-side, second check)
      const validMagic = await validateAudioMagicBytes(audioFile)
      if (!validMagic) {
        console.warn(VOICE_LOG, "Rejected file: magic bytes do not match any known audio format")
        return errorResponse("File content does not match a supported audio format", 415)
      }

      // Normalize video/webm → audio/webm for Whisper compatibility
      const whisperMime = normalizeAudioMime(baseMime)

      // Validate language parameters against allowlist
      const sourceLanguageRaw = (formData.get("sourceLanguage") as string) ?? "auto"
      const targetLanguageRaw = (formData.get("targetLanguage") as string) ?? "en"
      const sourceLanguage = VALID_SOURCE_CODES.has(sourceLanguageRaw) ? sourceLanguageRaw : "auto"
      const targetLanguage = VALID_TARGET_CODES.has(targetLanguageRaw) ? targetLanguageRaw : "en"
      const autoTranslate = (formData.get("autoTranslate") as string) === "true"

      const translateToEnglish = shouldUseWhisperTranslation(sourceLanguage, targetLanguage, autoTranslate)

      console.warn(VOICE_LOG, `Transcribe request: source=${sourceLanguage} target=${targetLanguage} translate=${translateToEnglish} size=${audioFile.size}`)

      try {
        const result = await callWhisperAPI({
          apiKey,
          audioBlob: audioFile,
          audioMime: whisperMime,
          sourceLanguage,
          translateToEnglish,
        })

        const response: VoiceTranscribeResponse = {
          text: result.text.trim(),
          detectedLanguage: result.language,
          translated: translateToEnglish,
        }

        console.warn(VOICE_LOG, `Transcription complete: ${result.text.length} chars, lang=${result.language ?? "unknown"}`)
        return jsonResponse(response)
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn(VOICE_LOG, `Transcription failed: ${message}`)
        return errorResponse("Transcription failed. Check server logs.", 502)
      }
    }

    return errorResponse("Not found", 404)
  }
}
