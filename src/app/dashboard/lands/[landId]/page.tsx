"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import Navbar from "@/src/components/Navbar";
import { StatusPill } from "@/src/components/shared/StatusPill";
import { OwnershipPanel } from "@/src/components/land/OwnershipPanel";
import { OccupancyAgreementCard, type OccupancyAgreement } from "@/src/components/occupancy/OccupancyAgreementCard";
import {
  CONTRACT_V9_ABI,
  CONTRACT_V9_ADDRESS,
  LandStatusV9,
  LandTypeV9,
  landTypeLabel,
} from "@/src/utils/contractV9";

type Tab = "ownership" | "occupancy" | "inheritance" | "subdivision" | "audit";

/**
 * Property detail page with the canonical 5 tabs.
 *
 * The three layer-distinguishing panels (ownership / occupancy / subdivision)
 * are always visible on the headline summary so the layer boundaries stay
 * obvious. The NFT tokenId only appears on the Audit tab.
 */
export default function PropertyDetail({
  params,
}: {
  params: Promise<{ landId: string }>;
}) {
  const { landId } = use(params);
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("ownership");
  useEffect(() => setMounted(true), []);

  const { data: record, isLoading } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getLandRecord",
    args: [landId],
  });

  if (!mounted) return null;

  const r = record as
    | {
        landId: string;
        ipfsHash: string;
        landType: number;
        status: number;
        proposedAt: bigint;
        verifiedAt: bigint;
      }
    | undefined;

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="glass-card p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Property</div>
              <h1 className="text-2xl font-semibold font-mono">{landId}</h1>
              <div className="text-white/60 text-sm mt-1">
                {r ? (
                  <>{landTypeLabel(r.landType as LandTypeV9)} · Verified {r.verifiedAt > BigInt(0) ? new Date(Number(r.verifiedAt) * 1000).toISOString().slice(0, 10) : "—"}</>
                ) : isLoading ? (
                  "Loading…"
                ) : (
                  "v9 contract not deployed at configured address — read failed."
                )}
              </div>
            </div>
            {r && <StatusPill status={r.status as LandStatusV9} />}
          </div>
        </header>

        {/* Three-panel layer-distinction summary */}
        <LayerSummary landId={landId} viewer={address as `0x${string}` | undefined} />

        {/* Tabs */}
        <div className="border-b border-white/10 flex gap-1 overflow-x-auto">
          {(["ownership", "occupancy", "inheritance", "subdivision", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 transition ${
                tab === t
                  ? "border-indigo-500 text-white"
                  : "border-transparent text-white/60 hover:text-white"
              }`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {tab === "ownership" && <OwnershipTab landId={landId} viewer={address as `0x${string}` | undefined} />}
        {tab === "occupancy" && <OccupancyTab landId={landId} viewer={address as `0x${string}` | undefined} />}
        {tab === "inheritance" && <InheritanceTab landId={landId} />}
        {tab === "subdivision" && <SubdivisionTab />}
        {tab === "audit" && <AuditTab landId={landId} ipfsHash={r?.ipfsHash ?? ""} />}
      </div>
    </main>
  );
}

function LayerSummary({ landId, viewer }: { landId: string; viewer?: `0x${string}` }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="surface rounded-2xl p-5 border border-white/10">
        <div className="text-xs uppercase tracking-wider text-indigo-300 mb-2">Ownership (layer 2)</div>
        <p className="text-sm text-white/70 mb-3">
          Basis-point shares of legal title. Multiple co-owners allowed.
        </p>
        <Link href="#ownership" onClick={() => {}} className="text-xs text-indigo-300 hover:text-indigo-200">
          See full share ledger ↓
        </Link>
      </div>
      <div className="surface rounded-2xl p-5 border border-white/10">
        <div className="text-xs uppercase tracking-wider text-green-300 mb-2">Occupancy (separate ledger)</div>
        <p className="text-sm text-white/70 mb-3">
          Time-bounded rights of use — leases, tenancies, easements.
          <span className="text-white/50"> Never moves the NFT.</span>
        </p>
        <Link href="#occupancy" className="text-xs text-green-300 hover:text-green-200">
          See agreements ↓
        </Link>
      </div>
      <div className="surface rounded-2xl p-5 border border-white/10">
        <div className="text-xs uppercase tracking-wider text-yellow-300 mb-2">Subdivision (layer 1)</div>
        <p className="text-sm text-white/70 mb-3">
          Court-anchored split into new parcels.
          <span className="text-white/50"> The only operation that mints new NFTs after import.</span>
        </p>
        <Link href="#subdivision" className="text-xs text-yellow-300 hover:text-yellow-200">
          See lineage ↓
        </Link>
      </div>
    </div>
  );
}

function OwnershipTab({ landId, viewer }: { landId: string; viewer?: `0x${string}` }) {
  return <OwnershipPanel landId={landId} highlightAddress={viewer} />;
}

function OccupancyTab({ landId, viewer }: { landId: string; viewer?: `0x${string}` }) {
  const { data, isLoading } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getActiveOccupancyAgreements",
    args: [landId],
  });
  const list = ((data ?? []) as unknown as OccupancyAgreement[]).slice();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Active agreements ({isLoading ? "…" : list.length})</h2>
        <Link href={`/dashboard/occupancy?landId=${encodeURIComponent(landId)}`} className="text-xs text-indigo-300 hover:text-indigo-200">
          Manage in Occupancy module →
        </Link>
      </div>
      {isLoading ? (
        <div className="surface rounded-2xl p-6 animate-pulse h-32" />
      ) : list.length === 0 ? (
        <div className="text-white/50 text-sm">No active occupancy agreements on this land.</div>
      ) : (
        <div className="grid gap-3">
          {list.map((a, i) => (
            <OccupancyAgreementCard key={`${a.id}-${i}`} agreement={a} viewerAddress={viewer} />
          ))}
        </div>
      )}
    </div>
  );
}

function InheritanceTab({ landId }: { landId: string }) {
  return (
    <div className="space-y-4">
      <div className="surface rounded-2xl p-6 border border-white/10">
        <h2 className="text-sm font-semibold mb-2">Inheritance</h2>
        <p className="text-sm text-white/70 mb-4">
          Open the inheritance portal to view the current proposal (if any) for this land. The
          vote screen exposes the court-order PDF, the proposed (heirs, shares) table, and the
          cryptographic <code>sharesHash</code> recompute affordance.
        </p>
        <Link
          href={`/dashboard/inheritance/vote/${encodeURIComponent(landId)}`}
          className="btn-primary px-4 py-2 inline-block text-sm"
        >
          Open vote screen →
        </Link>
      </div>
    </div>
  );
}

function SubdivisionTab() {
  return (
    <div className="surface rounded-2xl p-6 border border-white/10">
      <h2 className="text-sm font-semibold mb-2">Subdivision lineage</h2>
      <p className="text-sm text-white/70">
        Subdivision is the only operation that mints new NFTs after import. View
        <code> getParentLand(landId) </code>, <code> getChildLands(landId) </code>, and
        <code> getSubdivisionLineage(landId) </code> here once a v9 deployment is wired up.
      </p>
      <p className="text-xs text-white/40 italic mt-3">
        Lineage UI is structural — full implementation requires the v9 contract deployed.
      </p>
    </div>
  );
}

function AuditTab({ landId, ipfsHash }: { landId: string; ipfsHash: string }) {
  return (
    <div className="space-y-3">
      <div className="surface rounded-2xl p-5 border border-white/10">
        <h2 className="text-sm font-semibold mb-2">NFT identity (layer 1)</h2>
        <div className="font-mono text-xs text-white/80 break-all space-y-1">
          <div>
            tokenId: <span className="text-white/50">deterministic — uint256(keccak256(landId))</span>
          </div>
          <div>
            ERC-721 metadata CID:{" "}
            <span className="text-white/90">{ipfsHash || "—"}</span>
          </div>
          <div>
            Land ID: <span className="text-white/90">{landId}</span>
          </div>
        </div>
        <p className="text-xs text-white/50 mt-3">
          This is the only place in the UI where you see the raw NFT identity. Ownership lives
          in the share ledger; this tokenId persists for the lifetime of the parcel and never
          moves except at subdivision burn.
        </p>
      </div>

      <div className="surface rounded-2xl p-5 border border-white/10">
        <h2 className="text-sm font-semibold mb-2">Events & legal documents</h2>
        <p className="text-sm text-white/70">
          Once an indexer is connected, this panel will list every <code>ShareholderAdded / Removed /
          ShareTransferred</code>, every <code>InheritanceInitiated / HeirApproved / Finalized /
          LegalOverrideExecuted</code>, every <code>SubdivisionProposed / Finalized /
          ChildLandCreated</code>, every <code>OccupancyGranted / Revoked</code>, plus every IPFS CID
          ever attached to this land.
        </p>
      </div>
    </div>
  );
}
