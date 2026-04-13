import { NavLink, Outlet, useNavigate, useOutletContext } from "react-router-dom"
import { ArrowLeft, Box, User } from "lucide-react"
import { cn } from "../lib/utils"
import type { AppState } from "./useAppState"

const TABS = [
  { path: "providers", label: "Providers", icon: Box },
  { path: "profiles", label: "Profiles", icon: User },
] as const

export function SettingsPage() {
  const navigate = useNavigate()
  const state = useOutletContext<AppState>()
  return (
    <div className="flex h-full w-full">
      <nav className="w-48 shrink-0 border-r border-border p-4 flex flex-col gap-1">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <h2 className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Settings
        </h2>
        {TABS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet context={state} />
      </main>
    </div>
  )
}
