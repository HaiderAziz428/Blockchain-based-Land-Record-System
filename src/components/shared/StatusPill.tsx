"use client";

import { LandStatusV9, landStatusLabel } from "@/src/utils/contractV9";

const TONES: Record<LandStatusV9, { bg: string; text: string; border: string; icon: string }> = {
  [LandStatusV9.PENDING_VERIFICATION]:        { bg: "bg-yellow-500/10",  text: "text-yellow-300",  border: "border-yellow-500/20",  icon: "⏳" },
  [LandStatusV9.ACTIVE]:                       { bg: "bg-green-500/10",   text: "text-green-300",   border: "border-green-500/20",   icon: "🟢" },
  [LandStatusV9.PENDING_INHERITANCE]:          { bg: "bg-indigo-500/10",  text: "text-indigo-300",  border: "border-indigo-500/20",  icon: "⚖️" },
  [LandStatusV9.PENDING_SUBDIVISION]:          { bg: "bg-indigo-500/10",  text: "text-indigo-300",  border: "border-indigo-500/20",  icon: "🗺️" },
  [LandStatusV9.LOCKED_IMPORT_DISPUTE]:        { bg: "bg-red-500/10",     text: "text-red-300",     border: "border-red-500/20",     icon: "🔒" },
  [LandStatusV9.LOCKED_INHERITANCE_DISPUTE]:   { bg: "bg-red-500/10",     text: "text-red-300",     border: "border-red-500/20",     icon: "🔒" },
  [LandStatusV9.LOCKED_SUBDIVISION_DISPUTE]:   { bg: "bg-red-500/10",     text: "text-red-300",     border: "border-red-500/20",     icon: "🔒" },
  [LandStatusV9.SUBDIVIDED]:                   { bg: "bg-white/5",        text: "text-white/60",     border: "border-white/10",       icon: "📦" },
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
