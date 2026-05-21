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
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <header className="space-y-1">
          <span className="text-xs font-semibold font-sans text-muted tracking-[0.2em] uppercase">Succession Module</span>
          <h1 className="font-sans text-2xl font-semibold text-foreground tracking-tight mt-1">Inheritance Portal</h1>
          <p className="text-muted text-sm">
            File appeals, vote on proposals, dispute, and track inheritance cases.
            Inheritance redistributes ownership shares — it does NOT subdivide land or create new NFTs.
          </p>
        </header>

        {!isConnected ? (
          <div className="glass-card p-8 text-center rounded-2xl">
            <p className="text-muted mb-4">Connect your wallet to access the inheritance portal.</p>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="surface rounded-2xl p-5 surface-hover">
                <div className="text-xs uppercase text-muted tracking-wider mb-1">File new appeal</div>
                <div className="text-foreground text-sm mb-3">
                  Submit a court order to begin an inheritance redistribution case for a deceased shareholder.
                </div>
                <Link href="/dashboard/inheritance/appeals/new" className="btn-primary text-sm px-4 py-2 inline-block">
                  File appeal →
                </Link>
              </div>
              <div className="surface rounded-2xl p-5 surface-hover">
                <div className="text-xs uppercase text-muted tracking-wider mb-1">Pending votes</div>
                <div className="text-foreground text-sm mb-3">
                  Inheritance proposals where you are a named heir.
                </div>
                <div className="text-muted text-xs italic">
                  Coming soon: indexer-backed list of pending votes.
                </div>
              </div>
              <div className="surface rounded-2xl p-5 surface-hover">
                <div className="text-xs uppercase text-muted tracking-wider mb-1">My appeals</div>
                <div className="text-foreground text-sm mb-3">
                  Appeals you have filed and their off-chain review status.
                </div>
                <div className="text-muted text-xs italic">
                  Coming soon: backend-indexed appeal list.
                </div>
              </div>
            </div>

            <div className="surface rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-foreground mb-3">Jump to a proposal</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  className="field flex-1"
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
              <p className="text-xs text-muted mt-3">
                The vote screen shows the court-order PDF, the proposed (heirs, shares) table, and the
                cryptographic <code className="text-accent">sharesHash</code> recompute button so you can independently verify the
                inputs the contract committed.
              </p>
            </div>

            <div className="surface rounded-2xl p-6">
              <h2 className="text-sm font-semibold text-foreground mb-2">How inheritance works in this system</h2>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-muted">
                <li>An heir files an appeal with a court order CID (calls <code className="text-accent">fileInheritanceAppeal</code>).</li>
                <li>The backend (REGISTRAR) reviews the court order off-chain and files an immutable proposal on-chain.</li>
                <li>The proposal commits <code className="text-accent">sharesHash = keccak256(heirs, heirShares, courtOrderCid)</code> — auditable.</li>
                <li>All named heirs vote within 30 days. Unanimous approval auto-executes the redistribution.</li>
                <li>Any heir can dispute. Disputes freeze the proposal until a court-anchored RESOLVER resolves it
                  with an updated court order, a legal-resolution document, and a written reason.</li>
              </ol>
              <p className="text-xs text-muted mt-4">
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
