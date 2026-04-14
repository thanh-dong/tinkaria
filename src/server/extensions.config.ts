import { c3Extension } from "./extensions/c3/server"
import { agentsExtension } from "./extensions/agents/server"
import { codeExtension } from "./extensions/code/server"
import type { ServerExtension } from "../shared/extension-types"

export const serverExtensions: ServerExtension[] = [
  c3Extension,
  agentsExtension,
  codeExtension,
]
