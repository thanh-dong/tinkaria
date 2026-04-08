import { LOG_PREFIX } from "../shared/branding"

export interface NatsDaemonInfo {
  url: string
  wsUrl: string
  wsPort: number
  pid: number
}

export interface NatsDaemonReadiness extends NatsDaemonInfo {
  ok: boolean
}

export class NatsDaemonManager {
  private daemonProcess: ReturnType<typeof Bun.spawn> | null = null
  private info: NatsDaemonInfo | null = null

  async ensureDaemon(options: {
    token: string
    host?: string
  }): Promise<NatsDaemonInfo> {
    // Reuse if already running and alive
    if (this.info && this.daemonProcess) {
      try {
        process.kill(this.info.pid, 0) // check alive
        return this.info
      } catch {
        // Process died, restart
        this.daemonProcess = null
        this.info = null
      }
    }

    const daemonScript = new URL("../nats/nats-daemon.ts", import.meta.url).pathname

    const child = Bun.spawn(["bun", "run", daemonScript], {
      env: {
        ...process.env,
        NATS_TOKEN: options.token,
        ...(options.host ? { NATS_HOST: options.host } : {}),
      },
      stdio: ["ignore", "pipe", "inherit"],
    })

    // Read JSON info from stdout
    const reader = child.stdout.getReader()
    const { value } = await reader.read()
    if (!value) {
      child.kill("SIGTERM")
      throw new Error("NATS daemon produced no output")
    }

    const text = new TextDecoder().decode(value).trim()
    let info: NatsDaemonInfo
    try {
      info = JSON.parse(text) as NatsDaemonInfo
    } catch (error) {
      child.kill("SIGTERM")
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to parse NATS daemon output: ${message}`)
    }

    this.daemonProcess = child
    this.info = info

    console.warn(LOG_PREFIX, `NATS daemon started — pid: ${info.pid}, url: ${info.url}`)

    return info
  }

  getReadiness(): NatsDaemonReadiness | null {
    if (!this.info) return null
    let ok = false
    try {
      process.kill(this.info.pid, 0)
      ok = true
    } catch {
      ok = false
    }
    return {
      ...this.info,
      ok,
    }
  }

  async dispose(): Promise<void> {
    if (this.daemonProcess) {
      this.daemonProcess.kill("SIGTERM")
      await this.daemonProcess.exited
      this.daemonProcess = null
      this.info = null
      console.warn(LOG_PREFIX, "NATS daemon stopped")
    }
  }
}
