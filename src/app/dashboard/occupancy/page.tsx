"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import Navbar from "@/src/components/Navbar";
import { OccupancyAgreementCard, type OccupancyAgreement } from "@/src/components/occupancy/OccupancyAgreementCard";
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from "@/src/utils/contractV9";

/**
 * Occupancy & use-rights module landing.
 *
 * Lookup-by-landId UX for the v8/v9 occupancy ledger. A full
 * "all occupancy I'm involved in" cross-land view requires the
 * indexer (see docs/backend/01) and is left for follow-up.
 */
export default function OccupancyLanding() {
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [landId, setLandId] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Occupancy & use-rights</h1>
          <p className="text-white/60 text-sm">
            Time-bounded rights of use — leases, tenancies, easements, farming rights.
            Occupancy is a separate ledger from ownership; granting or revoking it
            does NOT move the NFT and does NOT change ownership shares.
          </p>
        </header>

        <Explainer />

        {!isConnected ? (
          <div className="glass-card p-8 text-center">
            <p className="text-white/70">Connect your wallet to manage occupancy agreements.</p>
          </div>
        ) : (
          <div className="glass-card p-6">
            <h2 className="text-sm font-semibold mb-3">View agreements for a land</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                className="field flex-1 px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                placeholder="Land ID (e.g. DHA_PHASE_9:R-2/417)"
                value={landId}
                onChange={(e) => setLandId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && landId) setSubmitted(landId); }}
              />
              <button
                onClick={() => landId && setSubmitted(landId)}
                disabled={!landId}
                className="btn-primary px-4 py-2"
              >
                Load occupancy →
              </button>
            </div>
          </div>
        )}

        {submitted && address && (
          <OccupancyList landId={submitted} viewer={address as `0x${string}`} />
        )}
      </div>
    </main>
  );
}

function Explainer() {
  return (
    <div className="surface rounded-2xl p-6 border border-white/10">
      <h2 className="text-sm font-semibold text-white mb-3">
        Quick reminder — three independent concepts
      </h2>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg p-3 bg-black/30 border border-white/10">
          <div className="text-xs uppercase tracking-wider text-indigo-300 mb-1">Ownership</div>
          <p className="text-white/70">
            What fraction of the legal title you hold. Lives in the share ledger
            (basis points). Changed by transfer, sale, inheritance.
          </p>
        </div>
        <div className="rounded-lg p-3 bg-black/30 border border-white/10">
          <div className="text-xs uppercase tracking-wider text-green-300 mb-1">Occupancy</div>
          <p className="text-white/70">
            A time-bounded right to USE the parcel. Lives in a separate ledger.
            Never moves the NFT and never changes shares.
          </p>
        </div>
        <div className="rounded-lg p-3 bg-black/30 border border-white/10">
          <div className="text-xs uppercase tracking-wider text-yellow-300 mb-1">Subdivision</div>
          <p className="text-white/70">
            Court-anchored split of one parcel into many. Burns the NFT and mints
            children. Use the Subdivision tab on the property detail page.
          </p>
        </div>
      </div>
    </div>
  );
}

function OccupancyList({ landId, viewer }: { landId: string; viewer: `0x${string}` }) {
  const { data: active, isLoading: aLoading } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getActiveOccupancyAgreements",
    args: [landId],
  });
  const { data: all, isLoading: hLoading } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getOccupancyAgreements",
    args: [landId],
  });

  const activeList = ((active ?? []) as unknown as OccupancyAgreement[]).slice();
  const allList = ((all ?? []) as unknown as OccupancyAgreement[]).slice();
  const activeIds = new Set(activeList.map((a) => String(a.id)));
  const history = allList.filter((a) => !activeIds.has(String(a.id)));

  return (
    <>
      <section>
        <h2 className="text-sm font-semibold text-white mb-3">
          Active agreements <span className="text-white/40">({aLoading ? "…" : activeList.length})</span>
        </h2>
        {aLoading ? (
          <Skeleton />
        ) : activeList.length === 0 ? (
          <div className="text-white/50 text-sm">No active agreements on this land.</div>
        ) : (
          <div className="grid gap-3">
            {activeList.map((a, i) => (
              <OccupancyAgreementCard key={`${a.id}-${i}`} agreement={a} viewerAddress={viewer} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-white mb-3">
          History — revoked + expired <span className="text-white/40">({hLoading ? "…" : history.length})</span>
        </h2>
        {hLoading ? (
          <Skeleton />
        ) : history.length === 0 ? (
          <div className="text-white/50 text-sm">No revoked or expired agreements yet.</div>
        ) : (
          <div className="grid gap-3">
            {history.map((a, i) => (
              <OccupancyAgreementCard key={`h-${a.id}-${i}`} agreement={a} viewerAddress={viewer} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="surface rounded-2xl p-5 border border-white/10 animate-pulse h-32" />
      ))}
    </div>
  );
}
