"use client";

import {
  OccupancyCategoryV9,
  occupancyCategoryLabel,
  occupancyCategoryIcon,
} from "@/src/utils/contractV9";

export type OccupancyAgreement = {
  id: bigint;
  category: number; // OccupancyCategoryV9
  grantor: `0x${string}`;
  occupant: `0x${string}`;
  startTime: bigint; // unix seconds, uint64
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

export function OccupancyAgreementCard({
  agreement,
  viewerAddress,
  onRevoke,
}: {
  agreement: OccupancyAgreement;
  viewerAddress?: `0x${string}`;
  onRevoke?: () => void;
}) {
  const a = agreement;
  const now = Math.floor(Date.now() / 1000);
  const s = statusOf(a, now);
  const isGrantor = viewerAddress?.toLowerCase() === a.grantor.toLowerCase();
  const isOccupant = viewerAddress?.toLowerCase() === a.occupant.toLowerCase();

  const tone =
    s === "active" ? "border-green-500/30 bg-green-500/[0.03]" :
    s === "future" ? "border-blue-500/30 bg-blue-500/[0.03]" :
    s === "revoked" ? "border-red-500/20 bg-red-500/[0.03] opacity-70" :
    "border-white/10 bg-white/[0.02] opacity-70";

  return (
    <div className={`rounded-2xl p-5 border ${tone}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-white">
          <span aria-hidden className="text-lg">
            {occupancyCategoryIcon(a.category as OccupancyCategoryV9)}
          </span>
          <span className="font-semibold">
            {occupancyCategoryLabel(a.category as OccupancyCategoryV9)}
          </span>
          {isGrantor && <span className="pill bg-white/5 text-white/70 border border-white/10 text-[10px]">YOU GRANTED</span>}
          {isOccupant && <span className="pill bg-white/5 text-white/70 border border-white/10 text-[10px]">YOU OCCUPY</span>}
        </div>
        <span className={`pill border text-[10px] ${
          s === "active" ? "bg-green-500/10 text-green-300 border-green-500/20" :
          s === "future" ? "bg-blue-500/10 text-blue-300 border-blue-500/20" :
          s === "revoked" ? "bg-red-500/10 text-red-300 border-red-500/20" :
          "bg-white/5 text-white/60 border-white/10"
        }`}>
          {s.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-3">
        <div className="text-white/60">
          Grantor: <span className="font-mono text-white/80">{a.grantor.slice(0, 6)}…{a.grantor.slice(-4)}</span>
        </div>
        <div className="text-white/60">
          Occupant: <span className="font-mono text-white/80">{a.occupant.slice(0, 6)}…{a.occupant.slice(-4)}</span>
        </div>
        <div className="text-white/60">From: <span className="text-white/80">{fmtDate(a.startTime)}</span></div>
        <div className="text-white/60">Until: <span className="text-white/80">{fmtDate(a.endTime)}</span></div>
      </div>

      <div className="space-y-1 text-xs">
        <div className="text-white/50">Legal agreement (termsCid)</div>
        <div className="font-mono text-white/80 break-all bg-black/30 rounded px-2 py-1">
          {a.termsCid}
        </div>
        {a.descriptionCid && (
          <>
            <div className="text-white/50 mt-2">Description / floor plan (descriptionCid)</div>
            <div className="font-mono text-white/80 break-all bg-black/30 rounded px-2 py-1">
              {a.descriptionCid}
            </div>
          </>
        )}
      </div>

      {isGrantor && s === "active" && onRevoke && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={onRevoke} className="btn-secondary text-sm px-4 py-2">
            Revoke this agreement
          </button>
          <span className="text-xs text-white/50">
            Revocation does NOT affect ownership shares.
          </span>
        </div>
      )}
    </div>
  );
}
