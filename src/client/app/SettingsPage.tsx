import { useState } from "react"
import { useNavigate, useOutletContext } from "react-router-dom"
import { ArrowLeft, Box, Puzzle, Settings, User } from "lucide-react"
import { SegmentedControl, type SegmentedOption } from "../components/ui/segmented-control"
import { ProvidersTab } from "./ProvidersTab"
import { ProfilesTab } from "./ProfilesTab"
import { ExtensionsTab } from "./ExtensionsTab"
import type { AppState } from "./useAppState"

type TinkariaTab = "providers" | "profiles" | "extensions"

const TAB_OPTIONS: SegmentedOption<TinkariaTab>[] = [
  { value: "providers", label: "Providers", icon: Box, tooltip: "Providers" },
  { value: "profiles", label: "Profiles", icon: User, tooltip: "Profiles" },
  { value: "extensions", label: "Extensions", icon: Puzzle, tooltip: "Extensions" },
]

export function TinkariaPage() {
  const state = useOutletContext<AppState>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TinkariaTab>("providers")

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 md:pt-4 md:pb-3">
        <button
          onClick={() => navigate("/")}
          className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 md:hidden"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Settings className="size-4 text-muted-foreground hidden md:block" />
        <h1 className="text-base font-semibold text-foreground md:text-lg">Tinkaria</h1>
      </div>
      <div className="px-4 mb-3">
        <SegmentedControl
          value={activeTab}
          onValueChange={setActiveTab}
          options={TAB_OPTIONS}
          size="sm"
          className="w-full md:w-auto"
          optionClassName="flex-1 md:flex-initial justify-center"
          alwaysShowLabels
        />
      </div>
      <div className="flex-1 min-h-0 px-4 pb-4 overflow-y-auto">
        {activeTab === "providers" && <ProvidersTab state={state} />}
        {activeTab === "profiles" && <ProfilesTab state={state} />}
        {activeTab === "extensions" && <ExtensionsTab state={state} />}
      </div>
    </div>
  )
}
