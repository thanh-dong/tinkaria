import { type ReactNode, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Plus, ChevronRight } from "lucide-react";

export interface SessionOption {
  sessionId: string;
  label: string;
}

interface PanelHeaderProps {
  title: string;
  count?: number;
  countLabel?: string;
  onAdd: () => void;
  addLabel: string;
  children?: ReactNode;
}

export function PanelHeader({ title, count, countLabel, onAdd, addLabel, children }: PanelHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          {title}
          {count !== undefined && count > 0 && (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({countLabel || count})
            </span>
          )}
        </h3>
        <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label={addLabel}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {children}
    </>
  );
}

interface PanelAddFormProps {
  show: boolean;
  children: ReactNode;
}

export function PanelAddForm({ show, children }: PanelAddFormProps) {
  if (!show) return null;
  return (
    <div className="px-3 py-2 border-b border-border space-y-2">
      {children}
    </div>
  );
}

interface PanelBodyProps {
  children: ReactNode;
}

export function PanelBody({ children }: PanelBodyProps) {
  return <div className="flex-1 overflow-y-auto">{children}</div>;
}

interface PanelEmptyStateProps {
  message: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PanelEmptyState({ message, description, actionLabel, onAction }: PanelEmptyStateProps) {
  return (
    <div className="px-3 py-6 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {description && <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

interface PanelListItemProps {
  children: ReactNode;
  className?: string;
}

export function PanelListItem({ children, className }: PanelListItemProps) {
  return (
    <div className={cn("px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors", className)}>
      {children}
    </div>
  );
}

interface PanelSectionHeaderProps {
  children: ReactNode;
}

export function PanelSectionHeader({ children }: PanelSectionHeaderProps) {
  return (
    <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
      {children}
    </div>
  );
}

interface PanelCollapsibleSectionProps {
  label: string;
  count: number;
  children: ReactNode;
}

export function PanelCollapsibleSection({ label, count, children }: PanelCollapsibleSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <PanelSectionHeader>
        <button type="button" className="w-full text-left flex items-center gap-1" onClick={() => setOpen(!open)}>
          <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
          {label} ({count})
        </button>
      </PanelSectionHeader>
      {open && children}
    </>
  );
}

interface SessionSelectProps {
  sessions?: SessionOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

export function SessionSelect({ sessions, value, onChange, placeholder = "Session ID...", className, ariaLabel = "Session", autoFocus }: SessionSelectProps) {
  if (sessions && sessions.length > 0) {
    return (
      <select
        className={cn("w-full rounded-md px-2 py-1 text-sm bg-transparent border border-border focus:ring-1 focus:ring-ring", className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
      >
        <option value="">Select session...</option>
        {sessions.map((s) => (
          <option key={s.sessionId} value={s.sessionId}>{s.label}</option>
        ))}
      </select>
    );
  }
  return (
    <Input
      size="sm"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      autoFocus={autoFocus}
    />
  );
}
