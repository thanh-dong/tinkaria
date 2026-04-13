import { useState } from "react"
import { useOutletContext } from "react-router-dom"
import { Box, Settings, User } from "lucide-react"
import { SegmentedControl, type SegmentedOption } from "../components/ui/segmented-control"
import { PageHeader } from "./PageHeader"
import { ProvidersTab } from "./ProvidersTab"
import { ProfilesTab } from "./ProfilesTab"
import type { AppState } from "./useAppState"

type SettingsTab = "providers" | "profiles"

const TAB_OPTIONS: SegmentedOption<SettingsTab>[] = [
  { value: "providers", label: "Providers", icon: Box, tooltip: "Providers" },
  { value: "profiles", label: "Profiles", icon: User, tooltip: "Profiles" },
]

export function SettingsPage() {
  const state = useOutletContext<AppState>()
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers")

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <PageHeader title="Settings" icon={Settings} />
      <div className="px-4 mb-3">
        <SegmentedControl
          value={activeTab}
          onValueChange={setActiveTab}
          options={TAB_OPTIONS}
          size="sm"
          className="w-full md:w-auto"
          optionClassName="flex-1 md:flex-initial justify-center"
        />
      </div>
      <div className="flex-1 min-h-0 mx-4 mb-4 overflow-y-auto">
        {activeTab === "providers" && <ProvidersTab state={state} />}
        {activeTab === "profiles" && <ProfilesTab state={state} />}
      </div>
    </div>
  )
}
