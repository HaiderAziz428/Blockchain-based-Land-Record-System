"use client";

import { useMemo } from "react";
import { OccupancyCategoryV9, occupancyCategoryLabel, occupancyCategoryIcon } from "@/src/utils/contractV9";

export type OccupancyAgreement = {
  id: bigint;
  category: number;
  grantor: `0x${string}`;
  occupant: `0x${string}`;
  startTime: bigint;
  endTime: bigint;
  termsCid: string;
  descriptionCid: string;
  isRevoked: boolean;
};

function fmtDate(unix: bigint): string {
  return new Date(Number(unix) * 1000).toISOString().slice(0, 10);
}

function statusOf(a: OccupancyAgreement, now: number): "active" | "future" | "expired" | "revoked" {
  if (a.isRevoked) return "revoked";
  if (Number(a.endTime) <= now) return "expired";
  if (Number(a.startTime) > now) return "future";
  return "active";
}

export function OccupancyAgreementCard({ agreement, viewerAddress, onRevoke }: {
  agreement: OccupancyAgreement;
  viewerAddress?: `0x${string}`;
  onRevoke?: () => void;
}) {
  const a = agreement;
  const now = useMemo(() => Math.floor(Date.now() / 1000), []);
  const s = statusOf(a, now);
  const isGrantor = viewerAddress?.toLowerCase() === a.grantor.toLowerCase();
  const isOccupant = viewerAddress?.toLowerCase() === a.occupant.toLowerCase();

  const tone =
    s === "active"  ? "border-success/30 bg-success/[0.03]" :
    s === "future"  ? "border-accent/20 bg-accent/[0.03]" :
    s === "revoked" ? "border-danger/20 bg-danger/[0.03] opacity-70" :
                      "border-border bg-surface opacity-70";

  const statusTone =
    s === "active"  ? "bg-success/10 text-success border-success/20" :
    s === "future"  ? "bg-accent/10 text-accent border-accent/20" :
    s === "revoked" ? "bg-danger/10 text-danger border-danger/20" :
                      "bg-surface-elevated text-muted border-border";

  return (
    <div className={`rounded-2xl p-5 border ${tone}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-foreground">
          <span aria-hidden className="text-lg">{occupancyCategoryIcon(a.category as OccupancyCategoryV9)}</span>
          <span className="font-semibold">{occupancyCategoryLabel(a.category as OccupancyCategoryV9)}</span>
          {isGrantor  && <span className="pill bg-surface-elevated text-muted border border-border text-[10px]">YOU GRANTED</span>}
          {isOccupant && <span className="pill bg-surface-elevated text-muted border border-border text-[10px]">YOU OCCUPY</span>}
        </div>
        <span className={`pill border text-[10px] ${statusTone}`}>{s.toUpperCase()}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
        <div className="text-muted">Grantor: <span className="font-mono text-foreground">{a.grantor.slice(0, 6)}…{a.grantor.slice(-4)}</span></div>
        <div className="text-muted">Occupant: <span className="font-mono text-foreground">{a.occupant.slice(0, 6)}…{a.occupant.slice(-4)}</span></div>
        <div className="text-muted">From: <span className="text-foreground">{fmtDate(a.startTime)}</span></div>
        <div className="text-muted">Until: <span className="text-foreground">{fmtDate(a.endTime)}</span></div>
      </div>

      <div className="space-y-1 text-xs">
        <div className="text-muted">Legal agreement (termsCid)</div>
        <div className="font-mono text-foreground break-all bg-surface rounded px-2 py-1 border border-border">{a.termsCid}</div>
        {a.descriptionCid && (
          <>
            <div className="text-muted mt-2">Description / floor plan (descriptionCid)</div>
            <div className="font-mono text-foreground break-all bg-surface rounded px-2 py-1 border border-border">{a.descriptionCid}</div>
          </>
        )}
      </div>

      {isGrantor && s === "active" && onRevoke && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={onRevoke} className="btn-secondary text-sm px-4 py-2">Revoke this agreement</button>
          <span className="text-xs text-muted">Revocation does NOT affect ownership shares.</span>
        </div>
      )}
    </div>
  );
}
