import { useCallback, useEffect, useRef, useState } from "react"
import type { VoiceTranscribeResponse } from "../../shared/types"
import { useVoiceInputStore } from "../stores/voiceInputStore"

export type VoiceInputStatus = "idle" | "requesting" | "recording" | "transcribing" | "error"

interface VoiceInputResult {
  status: VoiceInputStatus
  error: string | null
  /** Whether the browser supports the MediaRecorder API */
  isSupported: boolean
  /** Whether the server has voice transcription configured */
  isAvailable: boolean | null
  /** Start recording from microphone */
  startRecording: () => void
  /** Stop recording and transcribe */
  stopRecording: () => void
  /** Toggle recording on/off */
  toggleRecording: () => void
}

/** Preferred audio MIME type — use webm/opus for best Whisper compatibility.
 *  Includes video/webm as fallback because Android MediaRecorder often only
 *  supports video/webm even for audio-only streams. */
function getPreferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm"
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus"
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm"
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4"
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus"
  if (MediaRecorder.isTypeSupported("video/webm;codecs=opus")) return "video/webm;codecs=opus"
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm"
  return "audio/webm"
}

// ── Auth token cache (shared across all hook instances) ──

let cachedAuthToken: string | null = null

async function getAuthToken(): Promise<string> {
  if (cachedAuthToken) return cachedAuthToken
  const res = await fetch("/auth/token")
  const data = await res.json() as { token?: string }
  if (!data.token) throw new Error("Failed to obtain auth token")
  cachedAuthToken = data.token
  return cachedAuthToken
}

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken()
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${token}`)
  return fetch(url, { ...init, headers })
}

// ── Server communication ──

async function checkServerAvailability(): Promise<boolean> {
  try {
    const res = await authedFetch("/api/voice/status")
    if (!res.ok) return false
    const data = await res.json() as { available: boolean }
    return data.available
  } catch {
    return false
  }
}

async function transcribeAudio(
  audioBlob: Blob,
  sourceLanguage: string,
  targetLanguage: string,
  autoTranslate: boolean,
): Promise<VoiceTranscribeResponse> {
  const formData = new FormData()
  formData.append("audio", audioBlob, "recording.webm")
  formData.append("sourceLanguage", sourceLanguage)
  formData.append("targetLanguage", targetLanguage)
  formData.append("autoTranslate", String(autoTranslate))

  const res = await authedFetch("/api/voice/transcribe", {
    method: "POST",
    body: formData,
  })

  if (!res.ok) {
    // If 401, token may have rotated — clear cache and retry once
    if (res.status === 401 && cachedAuthToken) {
      cachedAuthToken = null
      const retryRes = await authedFetch("/api/voice/transcribe", {
        method: "POST",
        body: formData,
      })
      if (retryRes.ok) {
        return await retryRes.json() as VoiceTranscribeResponse
      }
    }
    const body = await res.json().catch(() => ({ error: "Transcription failed" })) as { error?: string }
    throw new Error(body.error ?? `Server returned ${res.status}`)
  }

  return await res.json() as VoiceTranscribeResponse
}

// ── Hook ──

export function useVoiceInput(
  onTranscribed: (text: string, translated: boolean) => void,
): VoiceInputResult {
  const [status, setStatus] = useState<VoiceInputStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const sourceLanguage = useVoiceInputStore((s) => s.sourceLanguage)
  const targetLanguage = useVoiceInputStore((s) => s.targetLanguage)
  const autoTranslate = useVoiceInputStore((s) => s.autoTranslate)

  const isSecureContext = typeof window !== "undefined" && window.isSecureContext
  const hasMediaDevices = typeof navigator?.mediaDevices?.getUserMedia === "function"
  const hasMediaRecorder = typeof MediaRecorder !== "undefined"
  const isSupported = isSecureContext && hasMediaDevices && hasMediaRecorder

  // Check server availability on mount
  useEffect(() => {
    void checkServerAvailability().then(setIsAvailable)
  }, [])

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
    mediaRecorderRef.current = null
    chunksRef.current = []
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      if (!isSecureContext) {
        setError("Voice input requires HTTPS or localhost. Access the app via https:// or localhost instead of an IP address.")
      } else if (!hasMediaDevices) {
        setError("Microphone API not available. Check that your browser allows microphone access for this site.")
      } else {
        setError("MediaRecorder API is not available in this browser.")
      }
      setStatus("error")
      return
    }

    setError(null)
    setStatus("requesting")

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })

      streamRef.current = stream
      chunksRef.current = []

      const mimeType = getPreferredMimeType()
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        setStatus("transcribing")

        const audioBlob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] })
        cleanup()

        if (audioBlob.size === 0) {
          setError("No audio recorded")
          setStatus("error")
          return
        }

        try {
          const result = await transcribeAudio(
            audioBlob,
            sourceLanguage,
            targetLanguage,
            autoTranslate,
          )

          if (result.text.trim()) {
            onTranscribed(result.text, result.translated)
          }
          setStatus("idle")
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err)
          setError(message)
          setStatus("error")
        }
      }

      recorder.onerror = () => {
        setError("Recording failed")
        setStatus("error")
        cleanup()
      }

      // Collect chunks every 250ms for smoother processing
      recorder.start(250)
      setStatus("recording")
    } catch (err: unknown) {
      cleanup()
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("Permission") || message.includes("NotAllowed")) {
        setError("Microphone access denied. Check browser permissions.")
      } else {
        setError(message)
      }
      setStatus("error")
    }
  }, [isSupported, sourceLanguage, targetLanguage, autoTranslate, onTranscribed, cleanup])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state === "recording") {
      recorder.stop()
    }
  }, [])

  const toggleRecording = useCallback(() => {
    if (status === "recording") {
      stopRecording()
    } else if (status === "idle" || status === "error") {
      void startRecording()
    }
  }, [status, startRecording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    status,
    error,
    isSupported,
    isAvailable,
    startRecording: () => void startRecording(),
    stopRecording,
    toggleRecording,
  }
}
