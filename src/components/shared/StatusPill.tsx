"use client";

import { LandStatusV9, landStatusLabel } from "@/src/utils/contractV9";

const TONES: Record<LandStatusV9, { bg: string; text: string; border: string; icon: string }> = {
  [LandStatusV9.PENDING_VERIFICATION]:        { bg: "bg-warning/10",  text: "text-warning",  border: "border-warning/20",  icon: "⏳" },
  [LandStatusV9.ACTIVE]:                       { bg: "bg-success/10",  text: "text-success",  border: "border-success/20",  icon: "🟢" },
  [LandStatusV9.PENDING_INHERITANCE]:          { bg: "bg-pending/10",  text: "text-pending",  border: "border-pending/20",  icon: "⚖️" },
  [LandStatusV9.PENDING_SUBDIVISION]:          { bg: "bg-pending/10",  text: "text-pending",  border: "border-pending/20",  icon: "🗺️" },
  [LandStatusV9.LOCKED_IMPORT_DISPUTE]:        { bg: "bg-danger/10",   text: "text-danger",   border: "border-danger/20",   icon: "🔒" },
  [LandStatusV9.LOCKED_INHERITANCE_DISPUTE]:   { bg: "bg-danger/10",   text: "text-danger",   border: "border-danger/20",   icon: "🔒" },
  [LandStatusV9.LOCKED_SUBDIVISION_DISPUTE]:   { bg: "bg-danger/10",   text: "text-danger",   border: "border-danger/20",   icon: "🔒" },
  [LandStatusV9.SUBDIVIDED]:                   { bg: "bg-surface",     text: "text-muted",    border: "border-border",      icon: "📦" },
};

export function StatusPill({ status }: { status: LandStatusV9 }) {
  const tone = TONES[status] ?? TONES[LandStatusV9.ACTIVE];
  return (
    <span className={`pill ${tone.bg} ${tone.text} border ${tone.border} inline-flex items-center gap-1.5`}>
      <span aria-hidden>{tone.icon}</span>
      <span>{landStatusLabel(status)}</span>
    </span>
  );
}
