import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { getJourneySpec, getStageVerificationErrors, type JourneySpec, type JourneyStageSpec } from "../src/server/journey-verification"

interface RunnerOptions {
  journeyId: string
  clientPort: number
  serverPort: number
  projectPath: string
}

interface StageEvidence {
  stageId: string
  url: string
  uiIds: string[]
  screenshotPath: string
  snapshotPath: string
}

function parseArgs(argv: string[]): RunnerOptions {
  let journeyId = "homepage-to-new-chat"
  let clientPort = 5580
  let projectPath = process.cwd()

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--journey") {
      journeyId = argv[index + 1] ?? journeyId
      index += 1
      continue
    }
    if (arg === "--port") {
      const parsed = Number(argv[index + 1] ?? "")
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid --port value: ${argv[index + 1] ?? "<missing>"}`)
      }
      clientPort = parsed
      index += 1
      continue
    }
    if (arg === "--project") {
      projectPath = path.resolve(argv[index + 1] ?? projectPath)
      index += 1
      continue
    }
  }

  return {
    journeyId,
    clientPort,
    serverPort: clientPort + 1,
    projectPath,
  }
}

async function runCommand(
  args: string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; check?: boolean } = {},
): Promise<string> {
  const proc = Bun.spawn(args, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if ((options.check ?? true) && exitCode !== 0) {
    const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n")
    throw new Error(`Command failed (${args.join(" ")}): ${detail}`)
  }

  return stdout.trim()
}

async function runAgentBrowser(
  args: string[],
  env: Record<string, string | undefined>,
): Promise<string> {
  return runCommand(["agent-browser", ...args], { env })
}

async function waitForHealth(serverPort: number, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const healthUrl = `http://127.0.0.1:${serverPort}/health`

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl)
      if (response.ok) {
        const payload = await response.json() as { ok?: boolean }
        if (payload.ok) return
      }
    } catch {
      // Wait for startup.
    }

    await Bun.sleep(250)
  }

  throw new Error(`Timed out waiting for ${healthUrl}`)
}

async function collectObservation(
  stage: JourneyStageSpec,
  evidenceDir: string,
  browserEnv: Record<string, string | undefined>,
): Promise<StageEvidence> {
  const screenshotPath = path.join(evidenceDir, `${stage.id}.png`)
  const snapshotPath = path.join(evidenceDir, `${stage.id}.snapshot.txt`)
  const url = await runAgentBrowser(["get", "url"], browserEnv)
  const uiIdsRaw = await runAgentBrowser([
    "eval",
    `Array.from(new Set(Array.from(document.querySelectorAll("[data-ui-id]"))
      .map((element) => element.getAttribute("data-ui-id"))
      .filter((value) => typeof value === "string")))`,
  ], browserEnv)
  const snapshot = await runAgentBrowser(["snapshot", "-i", "-c"], browserEnv)
  await runAgentBrowser(["screenshot", screenshotPath], browserEnv)
  await writeFile(snapshotPath, snapshot)
  const parsedUiIds = JSON.parse(uiIdsRaw) as unknown
  if (!Array.isArray(parsedUiIds) || parsedUiIds.some((value) => typeof value !== "string")) {
    throw new Error(`agent-browser returned invalid ui id payload for ${stage.id}: ${uiIdsRaw}`)
  }

  return {
    stageId: stage.id,
    url,
    uiIds: parsedUiIds,
    screenshotPath,
    snapshotPath,
  }
}

async function waitForStage(
  stage: JourneyStageSpec,
  evidenceDir: string,
  browserEnv: Record<string, string | undefined>,
  timeoutMs = 20_000,
): Promise<StageEvidence> {
  const deadline = Date.now() + timeoutMs
  let lastEvidence: StageEvidence | null = null

  while (Date.now() < deadline) {
    const evidence = await collectObservation(stage, evidenceDir, browserEnv)
    lastEvidence = evidence
    const errors = getStageVerificationErrors(
      { url: evidence.url, uiIds: evidence.uiIds },
      stage,
    )
    if (errors.length === 0) {
      return evidence
    }
    await Bun.sleep(400)
  }

  if (!lastEvidence) {
    throw new Error(`No evidence collected for stage ${stage.id}`)
  }

  const finalErrors = getStageVerificationErrors(
    { url: lastEvidence.url, uiIds: lastEvidence.uiIds },
    stage,
  )
  throw new Error(`Stage ${stage.id} did not verify: ${finalErrors.join("; ")}`)
}

async function clickProjectAction(
  actionUiId: string,
  browserEnv: Record<string, string | undefined>,
): Promise<void> {
  await runAgentBrowser(["click", `[data-ui-id="${actionUiId}"]`], browserEnv)
}

async function clickUiAction(
  actionUiId: string,
  browserEnv: Record<string, string | undefined>,
): Promise<void> {
  await runAgentBrowser(["click", `[data-ui-id="${actionUiId}"]`], browserEnv)
}

async function clickUiActionViaDom(
  actionUiId: string,
  browserEnv: Record<string, string | undefined>,
): Promise<void> {
  const resultRaw = await runAgentBrowser([
    "eval",
    `(() => {
      const button = document.querySelector(${JSON.stringify(`[data-ui-id="${actionUiId}"]`)});
      if (!(button instanceof HTMLElement)) {
        return { clicked: false };
      }
      const pointerDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 })
      const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
      const pointerUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 })
      const mouseUp = new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })
      button.dispatchEvent(pointerDown)
      button.dispatchEvent(mouseDown)
      button.dispatchEvent(pointerUp)
      button.dispatchEvent(mouseUp)
      button.click();
      return { clicked: true };
    })()`,
  ], browserEnv)
  const result = JSON.parse(resultRaw) as { clicked?: boolean }
  if (!result.clicked) {
    throw new Error(`Failed to click ${actionUiId} via DOM`)
  }
}

async function assertPageContainsText(
  text: string,
  browserEnv: Record<string, string | undefined>,
): Promise<void> {
  const bodyText = await runAgentBrowser(["get", "text", "body"], browserEnv)
  if (!bodyText.includes(text)) {
    throw new Error(`Expected page text to include: ${text}`)
  }
}

async function seedDiscoveredProject(homeDir: string, projectPath: string): Promise<void> {
  const codexDir = path.join(homeDir, ".codex")
  await mkdir(codexDir, { recursive: true })
  await writeFile(
    path.join(codexDir, "config.toml"),
    `[projects."${projectPath.replaceAll("\\", "\\\\")}"]\ntrust_level = "trusted"\n`,
  )

  const sessionDir = path.join(codexDir, "sessions", "2026", "04", "09")
  await mkdir(sessionDir, { recursive: true })
  const sessionId = crypto.randomUUID()
  const sessionPath = path.join(sessionDir, `${sessionId}.jsonl`)
  const sessionTimestamp = new Date("2026-04-09T12:00:00.000Z").toISOString()
  await writeFile(
    sessionPath,
    [
      JSON.stringify({
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd: projectPath,
          timestamp: sessionTimestamp,
        },
      }),
      JSON.stringify({
        type: "user",
        timestamp: sessionTimestamp,
        message: {
          content: "resume investigation of deterministic browser journeys",
        },
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: sessionTimestamp,
        message: {
          content: "Latest state captured for restart-safe session picker coverage.",
        },
      }),
    ].join("\n") + "\n",
  )
}

async function collectPersistenceEvidence(homeDir: string, projectPath: string) {
  const dataDir = path.join(homeDir, ".tinkaria-dev", "data")
  const snapshotPath = path.join(dataDir, "snapshot.json")
  await stat(snapshotPath)
  const snapshotRaw = await readFile(snapshotPath, "utf8")
  const snapshot = JSON.parse(snapshotRaw) as {
    projects?: Array<{ localPath?: string }>
    chats?: unknown[]
  }

  if (!snapshot.projects?.some((project) => project.localPath === projectPath)) {
    throw new Error(`snapshot.json does not mention ${projectPath}`)
  }
  if (!Array.isArray(snapshot.chats) || snapshot.chats.length === 0) {
    throw new Error("snapshot.json does not contain chat records")
  }

  return {
    dataDir,
    snapshotPath,
    projectCount: snapshot.projects?.length ?? 0,
    chatCount: snapshot.chats.length,
  }
}

async function pipeProcessStream(
  stream: ReadableStream<Uint8Array> | null,
  filePath: string,
): Promise<void> {
  if (!stream) return
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  await Bun.write(filePath, combined)
}

async function withDevServer<T>(
  options: RunnerOptions,
  homeDir: string,
  evidenceDir: string,
  run: (browserEnv: Record<string, string | undefined>) => Promise<T>,
): Promise<T> {
  const serverEnv = {
    ...process.env,
    HOME: homeDir,
    TINKARIA_RUNTIME_PROFILE: "dev",
  }
  const browserEnv = {
    ...process.env,
    AGENT_BROWSER_SESSION: `tinkaria-journey-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    AGENT_BROWSER_SESSION_NAME: `tinkaria-journey-${Date.now()}`,
  }

  const proc = Bun.spawn(
    ["bun", "run", "dev", "--", "--port", String(options.clientPort), "--no-open", "--strict-port"],
    {
      cwd: process.cwd(),
      env: serverEnv,
      stdout: "pipe",
      stderr: "pipe",
    },
  )

  try {
    await waitForHealth(options.serverPort)
    return await run(browserEnv)
  } finally {
    proc.kill()
    await Promise.all([
      pipeProcessStream(proc.stdout, path.join(evidenceDir, "dev-server.stdout.log")),
      pipeProcessStream(proc.stderr, path.join(evidenceDir, "dev-server.stderr.log")),
      proc.exited,
    ])
  }
}

async function executeJourney(spec: JourneySpec, options: RunnerOptions) {
  const runRoot = await mkdtemp(path.join(tmpdir(), "tinkaria-journey-"))
  const homeDir = path.join(runRoot, "home")
  const evidenceDir = path.join(runRoot, "evidence")
  await mkdir(homeDir, { recursive: true })
  await mkdir(evidenceDir, { recursive: true })
  await seedDiscoveredProject(homeDir, options.projectPath)
  await runCommand(["agent-browser", "close", "--all"], { check: false })

  const result = await withDevServer(options, homeDir, evidenceDir, async (browserEnv) => {
    await runAgentBrowser(["set", "viewport", "1440", "1024"], browserEnv)
    await runAgentBrowser(["open", `http://127.0.0.1:${options.clientPort}/`], browserEnv)
    const stageEvidence: StageEvidence[] = []

    const homepageEvidence = await waitForStage(spec.stages[0], evidenceDir, browserEnv)
    stageEvidence.push(homepageEvidence)

    if (spec.stages.length >= 2) {
      await assertPageContainsText(options.projectPath, browserEnv)
      await clickProjectAction("home.project-secondary.action", browserEnv)
      const chatEvidence = await waitForStage(spec.stages[1], evidenceDir, browserEnv)
      stageEvidence.push(chatEvidence)
    }

    if (spec.id === "homepage-to-fork-dialog") {
      await clickUiAction("chat.navbar.fork-session.action", browserEnv)
      const forkDialogEvidence = await waitForStage(spec.stages[2], evidenceDir, browserEnv)
      stageEvidence.push(forkDialogEvidence)
    }

    if (spec.id === "homepage-to-merge-dialog") {
      await clickUiAction("chat.navbar.merge-session.action", browserEnv)
      const mergeDialogEvidence = await waitForStage(spec.stages[2], evidenceDir, browserEnv)
      stageEvidence.push(mergeDialogEvidence)
    }

    if (spec.id === "homepage-to-session-picker") {
      await clickUiActionViaDom("sidebar.project-group.sessions.action", browserEnv)
      const sessionPickerEvidence = await waitForStage(spec.stages[2], evidenceDir, browserEnv)
      stageEvidence.push(sessionPickerEvidence)
    }

    const summary = {
      journey: spec,
      runRoot,
      homeDir,
      evidenceDir,
      projectPath: options.projectPath,
      clientUrl: `http://127.0.0.1:${options.clientPort}/`,
      serverUrl: `http://127.0.0.1:${options.serverPort}`,
      stages: stageEvidence,
      persistence: null,
    }
    await writeFile(
      path.join(evidenceDir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    )

    return summary
  })

  const persistence = spec.persistenceChecks
    ? await collectPersistenceEvidence(homeDir, options.projectPath)
    : null
  const completed = {
    ...result,
    persistence,
  }
  await writeFile(
    path.join(evidenceDir, "summary.json"),
    `${JSON.stringify(completed, null, 2)}\n`,
  )

  console.log(JSON.stringify(completed, null, 2))
}

const options = parseArgs(process.argv.slice(2))
const spec = getJourneySpec(options.journeyId)
await executeJourney(spec, options)
