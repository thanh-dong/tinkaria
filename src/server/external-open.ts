import { stat } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import type { ClientCommand } from "../shared/protocol"
import { resolveLocalPath } from "./paths"
import { hasCommand, spawnDetached } from "./process-utils"

type OpenExternalCommand = Extract<ClientCommand, { type: "system.openExternal" }>

export async function openExternal(command: OpenExternalCommand) {
  const resolvedPath = resolveLocalPath(command.localPath)
  const platform = process.platform
  const info = command.action === "open_finder"
    ? await stat(resolvedPath).catch(() => null)
    : null

  if (platform === "darwin") {
    if (command.action === "open_finder") {
      if (info?.isDirectory()) {
        spawnDetached("open", [resolvedPath])
      } else {
        spawnDetached("open", ["-R", resolvedPath])
      }
      return
    }
    if (command.action === "open_terminal") {
      spawnDetached("open", ["-a", "Terminal", resolvedPath])
      return
    }
  }

  if (platform === "win32") {
    if (command.action === "open_finder") {
      if (info?.isDirectory()) {
        spawnDetached("explorer", [resolvedPath])
      } else {
        spawnDetached("explorer", ["/select,", resolvedPath])
      }
      return
    }
    if (command.action === "open_terminal") {
      if (hasCommand("wt")) {
        spawnDetached("wt", ["-d", resolvedPath])
        return
      }
      spawnDetached("cmd", ["/c", "start", "", "cmd", "/K", `cd /d ${resolvedPath}`])
      return
    }
  }

  if (command.action === "open_finder") {
    spawnDetached("xdg-open", [info?.isDirectory() ? resolvedPath : path.dirname(resolvedPath)])
    return
  }
  if (command.action === "open_terminal") {
    for (const terminalCommand of ["x-terminal-emulator", "gnome-terminal", "konsole"]) {
      if (!hasCommand(terminalCommand)) continue
      if (terminalCommand === "gnome-terminal") {
        spawnDetached(terminalCommand, ["--working-directory", resolvedPath])
      } else if (terminalCommand === "konsole") {
        spawnDetached(terminalCommand, ["--workdir", resolvedPath])
      } else {
        spawnDetached(terminalCommand, ["--working-directory", resolvedPath])
      }
      return
    }
    spawnDetached("xdg-open", [resolvedPath])
  }
}
