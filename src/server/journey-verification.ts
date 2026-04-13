export type JourneyRouteExpectation =
  | { kind: "exact"; value: string }
  | { kind: "prefix"; value: string }

export interface JourneyStageSpec {
  id: string
  label: string
  owners: readonly string[]
  route: JourneyRouteExpectation
  requiredUiIds: readonly string[]
  expectedText: readonly string[]
}

export interface JourneySpec {
  id: string
  label: string
  stages: readonly JourneyStageSpec[]
  persistenceChecks: boolean
}

export interface StageProbeResult {
  missing: string[]
  c3ByUiId: Record<string, string | null>
  textByUiId: Record<string, string | null>
}

export type JourneyStageInventory = JourneyStageSpec
export type JourneyDefinition = JourneySpec

const HOME_READY_STAGE: JourneyStageSpec = {
  id: "home.ready",
  label: "Homepage connected with a visible project overview",
  owners: ["c3-117"],
  route: { kind: "exact", value: "/" },
  requiredUiIds: [
    "home.page",
    "home.header",
    "home.workspace-grid",
    "home.project-card",
    "home.project-overview",
    "home.project-primary.action",
    "home.project-secondary.action",
  ],
  expectedText: [
    "Workspaces",
    "Project Overview",
    "Start First Task",
  ],
}

const CHAT_READY_STAGE: JourneyStageSpec = {
  id: "chat.ready",
  label: "Chat shell rendered after starting a fresh task",
  owners: ["c3-110", "c3-111", "c3-112"],
  route: { kind: "prefix", value: "/chat/" },
  requiredUiIds: [
    "chat.page",
    "chat.navbar",
    "transcript.message-list",
    "chat.composer",
  ],
  expectedText: [],
}

const FORK_DIALOG_STAGE: JourneyStageSpec = {
  id: "fork-dialog.open",
  label: "Fork session dialog opened from the chat navbar",
  owners: ["c3-110"],
  route: { kind: "prefix", value: "/chat/" },
  requiredUiIds: [
    "chat.fork-session.dialog",
    "chat.fork-session.context.input",
    "chat.fork-session.submit.action",
    "chat.fork-session.cancel.action",
    "chat.fork-session.preset.action",
  ],
  expectedText: [],
}

const MERGE_DIALOG_STAGE: JourneyStageSpec = {
  id: "merge-dialog.open",
  label: "Merge session dialog opened from the chat navbar",
  owners: ["c3-110"],
  route: { kind: "prefix", value: "/chat/" },
  requiredUiIds: [
    "chat.merge-session.dialog",
    "chat.merge-session.sessions.list",
    "chat.merge-session.context.input",
    "chat.merge-session.submit.action",
    "chat.merge-session.cancel.action",
  ],
  expectedText: [],
}

export const HOME_TO_NEW_CHAT_JOURNEY: JourneySpec = {
  id: "homepage-to-new-chat",
  label: "Homepage project overview -> Start First Task -> chat shell",
  stages: [HOME_READY_STAGE, CHAT_READY_STAGE],
  persistenceChecks: true,
}

export const HOME_TO_FORK_DIALOG_JOURNEY: JourneySpec = {
  id: "homepage-to-fork-dialog",
  label: "Homepage project overview -> Start First Task -> fork dialog",
  stages: [HOME_READY_STAGE, CHAT_READY_STAGE, FORK_DIALOG_STAGE],
  persistenceChecks: true,
}

export const HOME_TO_MERGE_DIALOG_JOURNEY: JourneySpec = {
  id: "homepage-to-merge-dialog",
  label: "Homepage project overview -> Start First Task -> merge dialog",
  stages: [HOME_READY_STAGE, CHAT_READY_STAGE, MERGE_DIALOG_STAGE],
  persistenceChecks: true,
}

export function matchesJourneyRoute(pathname: string, expectation: JourneyRouteExpectation): boolean {
  if (expectation.kind === "exact") {
    return pathname === expectation.value
  }

  return pathname.startsWith(expectation.value)
}

export function buildStageProbeScript(stage: JourneyStageSpec): string {
  const uiIds = JSON.stringify([...stage.requiredUiIds])

  return `(() => {
    const uiIds = ${uiIds};
    const textByUiId = {};
    const c3ByUiId = {};
    const missing = [];

    for (const uiId of uiIds) {
      const selector = '[data-ui-id="' + uiId + '"]';
      const element = document.querySelector(selector);
      if (!element) {
        missing.push(uiId);
        c3ByUiId[uiId] = null;
        textByUiId[uiId] = null;
        continue;
      }

      c3ByUiId[uiId] = element.getAttribute("data-ui-c3");
      textByUiId[uiId] = element.textContent ? element.textContent.trim() : "";
    }

    return { missing, c3ByUiId, textByUiId };
  })()`
}

export function getJourneyStage(id: JourneyStageSpec["id"]): JourneyStageSpec {
  const stage = [
    ...HOME_TO_NEW_CHAT_JOURNEY.stages,
    ...HOME_TO_FORK_DIALOG_JOURNEY.stages,
    ...HOME_TO_MERGE_DIALOG_JOURNEY.stages,
  ].find((candidate) => candidate.id === id)
  if (!stage) {
    throw new Error(`Unknown journey stage: ${id}`)
  }

  return structuredClone(stage)
}

export function getJourneySpec(id: string): JourneySpec {
  switch (id) {
    case HOME_TO_NEW_CHAT_JOURNEY.id:
      return structuredClone(HOME_TO_NEW_CHAT_JOURNEY)
    case HOME_TO_FORK_DIALOG_JOURNEY.id:
      return structuredClone(HOME_TO_FORK_DIALOG_JOURNEY)
    case HOME_TO_MERGE_DIALOG_JOURNEY.id:
      return structuredClone(HOME_TO_MERGE_DIALOG_JOURNEY)
    default:
      throw new Error(`Unknown journey: ${id}`)
  }
}

export function getStageVerificationErrors(
  observed: { url: string; uiIds: string[] },
  stage: JourneyStageSpec,
): string[] {
  const errors: string[] = []
  const pathname = new URL(observed.url).pathname

  if (!matchesJourneyRoute(pathname, stage.route)) {
    errors.push(`expected route ${stage.route.kind} ${stage.route.value}, got ${pathname}`)
  }

  for (const uiId of stage.requiredUiIds) {
    if (!observed.uiIds.includes(uiId)) {
      errors.push(`missing ui id ${uiId}`)
    }
  }

  return errors
}
