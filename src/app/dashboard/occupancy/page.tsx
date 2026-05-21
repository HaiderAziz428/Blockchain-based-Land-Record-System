"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import Navbar from "@/src/components/Navbar";
import { OccupancyAgreementCard, type OccupancyAgreement } from "@/src/components/occupancy/OccupancyAgreementCard";
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from "@/src/utils/contractV9";

export default function OccupancyLanding() {
  const { isConnected, address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [landId, setLandId] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-1">
          <span className="text-xs font-semibold font-sans text-muted tracking-[0.2em] uppercase">Use-Rights Module</span>
          <h1 className="font-sans text-2xl font-semibold text-foreground tracking-tight mt-1">Occupancy & Use-Rights</h1>
          <p className="text-muted text-sm">
            Time-bounded rights of use — leases, tenancies, easements, farming rights.
            Occupancy is a separate ledger from ownership; granting or revoking it
            does NOT move the NFT and does NOT change ownership shares.
          </p>
        </header>

        <Explainer />

        {!isConnected ? (
          <div className="glass-card rounded-2xl p-8 text-center">
            <p className="text-muted">Connect your wallet to manage occupancy agreements.</p>
          </div>
        ) : (
          <div className="surface rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">View agreements for a land</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                className="field flex-1"
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
    <div className="surface rounded-2xl p-6">
      <h2 className="text-sm font-semibold text-foreground mb-3">
        Quick reminder — three independent concepts
      </h2>
      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg p-3 bg-surface-elevated border border-border">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">Ownership</div>
          <p className="text-muted">
            What fraction of the legal title you hold. Lives in the share ledger
            (basis points). Changed by transfer, sale, inheritance.
          </p>
        </div>
        <div className="rounded-lg p-3 bg-surface-elevated border border-border">
          <div className="text-xs uppercase tracking-wider text-success mb-1">Occupancy</div>
          <p className="text-muted">
            A time-bounded right to USE the parcel. Lives in a separate ledger.
            Never moves the NFT and never changes shares.
          </p>
        </div>
        <div className="rounded-lg p-3 bg-surface-elevated border border-border">
          <div className="text-xs uppercase tracking-wider text-warning mb-1">Subdivision</div>
          <p className="text-muted">
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
        <h2 className="text-sm font-semibold text-foreground mb-3">
          Active agreements <span className="text-muted">({aLoading ? "…" : activeList.length})</span>
        </h2>
        {aLoading ? (
          <Skeleton />
        ) : activeList.length === 0 ? (
          <div className="text-muted text-sm">No active agreements on this land.</div>
        ) : (
          <div className="grid gap-3">
            {activeList.map((a, i) => (
              <OccupancyAgreementCard key={`${a.id}-${i}`} agreement={a} viewerAddress={viewer} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">
          History — revoked + expired <span className="text-muted">({hLoading ? "…" : history.length})</span>
        </h2>
        {hLoading ? (
          <Skeleton />
        ) : history.length === 0 ? (
          <div className="text-muted text-sm">No revoked or expired agreements yet.</div>
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
        <div key={i} className="surface rounded-2xl p-5 animate-pulse h-32" />
      ))}
    </div>
  );
}
