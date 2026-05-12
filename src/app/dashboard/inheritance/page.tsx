"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Navbar from "@/src/components/Navbar";

export default function InheritancePortalLanding() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [landIdInput, setLandIdInput] = useState("");
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Inheritance portal</h1>
          <p className="text-white/60 text-sm">
            File appeals, vote on proposals, dispute, and track inheritance cases.
            Inheritance redistributes ownership shares — it does NOT subdivide land or create new NFTs.
          </p>
        </header>

        {!isConnected ? (
          <div className="glass-card p-8 text-center">
            <p className="text-white/70 mb-4">Connect your wallet to access the inheritance portal.</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="glass-card p-5">
                <div className="text-xs uppercase text-white/50 tracking-wider mb-1">File new appeal</div>
                <div className="text-white/90 text-sm mb-3">
                  Submit a court order to begin an inheritance redistribution case for a deceased shareholder.
                </div>
                <Link href="/dashboard/inheritance/appeals/new" className="btn-primary text-sm px-4 py-2 inline-block">
                  File appeal →
                </Link>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs uppercase text-white/50 tracking-wider mb-1">Pending votes</div>
                <div className="text-white/90 text-sm mb-3">
                  Inheritance proposals where you are a named heir.
                </div>
                <div className="text-white/40 text-xs italic">
                  Coming soon: indexer-backed list of pending votes.
                </div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs uppercase text-white/50 tracking-wider mb-1">My appeals</div>
                <div className="text-white/90 text-sm mb-3">
                  Appeals you have filed and their off-chain review status.
                </div>
                <div className="text-white/40 text-xs italic">
                  Coming soon: backend-indexed appeal list.
                </div>
              </div>
            </div>

            <div className="glass-card p-6">
              <h2 className="text-sm font-semibold mb-3">Jump to a proposal</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  className="field flex-1 px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
                  placeholder="Land ID (e.g. DHA_PHASE_9:R-2/417)"
                  value={landIdInput}
                  onChange={(e) => setLandIdInput(e.target.value)}
                />
                <Link
                  href={landIdInput ? `/dashboard/inheritance/vote/${encodeURIComponent(landIdInput)}` : "#"}
                  aria-disabled={!landIdInput}
                  className="btn-primary px-4 py-2"
                >
                  Open vote screen →
                </Link>
              </div>
              <p className="text-xs text-white/50 mt-3">
                The vote screen shows the court-order PDF, the proposed (heirs, shares) table, and the
                cryptographic <code>sharesHash</code> recompute button so you can independently verify the
                inputs the contract committed.
              </p>
            </div>

            <div className="surface rounded-2xl p-6 border border-white/10">
              <h2 className="text-sm font-semibold mb-2">How inheritance works in this system</h2>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-white/70">
                <li>An heir files an appeal with a court order CID (calls <code>fileInheritanceAppeal</code>).</li>
                <li>The backend (REGISTRAR) reviews the court order off-chain and files an immutable proposal on-chain.</li>
                <li>The proposal commits <code>sharesHash = keccak256(heirs, heirShares, courtOrderCid)</code> — auditable.</li>
                <li>All named heirs vote within 30 days. Unanimous approval auto-executes the redistribution.</li>
                <li>Any heir can dispute. Disputes freeze the proposal until a court-anchored RESOLVER resolves it
                  with an updated court order, a legal-resolution document, and a written reason.</li>
              </ol>
              <p className="text-xs text-white/50 mt-4">
                The land NFT and its tokenId persist unchanged across inheritance — heirs become co-shareholders
                of the SAME parcel, not owners of new ones.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
