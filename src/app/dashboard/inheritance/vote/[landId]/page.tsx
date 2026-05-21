"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import Navbar from "@/src/components/Navbar";
import { SharesHashVerifier } from "@/src/components/shared/SharesHashVerifier";
import { CourtOrderPreview } from "@/src/components/shared/CourtOrderPreview";
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS, formatBps } from "@/src/utils/contractV9";

export default function VoteScreen({ params }: { params: Promise<{ landId: string }> }) {
  const { landId } = use(params);
  const { address: me, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: req, isLoading: reqLoading, refetch } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getInheritanceRequest",
    args: [landId],
  });

  const { data: alreadyApproved } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "hasHeirApproved",
    args: me ? [landId, me] : undefined,
    query: { enabled: !!me },
  });

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: confirming, isSuccess: confirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (confirmed) void refetch();
  }, [confirmed, refetch]);

  // Must be before any conditional return to satisfy rules-of-hooks
  const nowMs = useMemo(() => Date.now(), []);

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="glass-card rounded-2xl p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Connect your wallet</h1>
            <p className="text-muted text-sm">You need a connected wallet to view an inheritance proposal.</p>
          </div>
        </div>
      </main>
    );
  }

  if (reqLoading) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="animate-pulse text-muted">Loading inheritance proposal…</div>
        </div>
      </main>
    );
  }

  const [
    deceased, heirs, heirShares, approvalCount, isExecuted,
    proposalNonce, courtOrderCid, appealId, sharesHash, votingDeadline,
  ] = (req ?? []) as readonly [
    `0x${string}`, readonly `0x${string}`[], readonly number[],
    bigint, boolean, bigint, string, bigint, `0x${string}`, bigint,
  ];

  const noProposal =
    !req || deceased === "0x0000000000000000000000000000000000000000" || heirs.length === 0;

  if (noProposal) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="glass-card rounded-2xl p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">No active inheritance proposal</h1>
            <p className="text-muted text-sm">
              Land <span className="font-mono text-accent">{landId}</span> has no pending inheritance proposal,
              or the v9 contract is not deployed at the configured address yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const isHeir     = heirs.some((h) => h.toLowerCase() === me?.toLowerCase());
  const myShareIdx = heirs.findIndex((h) => h.toLowerCase() === me?.toLowerCase());
  const myShareBps = myShareIdx >= 0 ? Number(heirShares[myShareIdx]) : 0;
  const deadlineDate   = new Date(Number(votingDeadline) * 1000);
  const expired        = nowMs > deadlineDate.getTime();
  const totalShareBps  = heirShares.reduce((a, b) => a + Number(b), 0);

  async function approve() {
    await writeContractAsync({ abi: CONTRACT_V9_ABI, address: CONTRACT_V9_ADDRESS, functionName: "approveSuccessionPlan", args: [landId] });
  }
  async function dispute() {
    await writeContractAsync({ abi: CONTRACT_V9_ABI, address: CONTRACT_V9_ADDRESS, functionName: "disputeSuccessionPlan", args: [landId] });
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <header>
          <span className="text-xs font-semibold font-sans text-muted tracking-[0.2em] uppercase">Inheritance Portal</span>
          <div className="flex items-baseline gap-3 flex-wrap mt-1">
            <h1 className="font-sans text-2xl font-semibold text-foreground tracking-tight">Inheritance Vote</h1>
            <span className="font-mono text-muted text-sm">{landId}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted mt-2 flex-wrap">
            <span>Proposal nonce {String(proposalNonce)}</span>
            <span>·</span>
            <span>Deceased <span className="font-mono">{deceased.slice(0, 6)}…{deceased.slice(-4)}</span></span>
            <span>·</span>
            <span>
              Voting deadline: {deadlineDate.toISOString().slice(0, 10)}
              {expired && <span className="text-danger ml-1">(EXPIRED)</span>}
            </span>
            <span>·</span>
            <span>Approvals: {String(approvalCount)} / {heirs.length}</span>
            {isExecuted && <span className="text-success">✓ EXECUTED</span>}
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-6">
          <CourtOrderPreview cid={courtOrderCid} label="Court order (succession order)" height={520} />

          <div className="space-y-4">
            <div className="surface rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">Proposed redistribution</h2>
                <span className="text-xs text-muted">appeal #{String(appealId)}</span>
              </div>

              <div className="space-y-1.5">
                {heirs.map((h, i) => {
                  const isMe = h.toLowerCase() === me?.toLowerCase();
                  return (
                    <div
                      key={`${h}-${i}`}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                        isMe ? "bg-accent/10 border-accent/20" : "bg-surface-elevated border-border"
                      }`}
                    >
                      <span className="font-mono text-sm text-foreground">
                        {h.slice(0, 6)}…{h.slice(-4)}
                        {isMe && <span className="ml-2 text-xs text-accent">(you)</span>}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-foreground">+{formatBps(heirShares[i])}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border mt-2">
                  <span className="text-xs uppercase tracking-wider text-muted">
                    Sum (must equal deceased&apos;s bps)
                  </span>
                  <span className="font-mono text-sm tabular-nums text-foreground">{formatBps(totalShareBps)}</span>
                </div>
              </div>
            </div>

            <SharesHashVerifier
              heirs={heirs}
              heirShares={heirShares.map((n) => Number(n))}
              courtOrderCid={courtOrderCid}
              expectedSharesHash={sharesHash}
            />
          </div>
        </div>

        {/* Action panel */}
        <div className="surface rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-foreground mb-2">Your action</h2>
          {!isHeir ? (
            <p className="text-muted text-sm">You are not a named heir on this proposal. You can read but not vote.</p>
          ) : isExecuted ? (
            <p className="text-success text-sm">Proposal already executed. Your new share is {formatBps(myShareBps)}.</p>
          ) : expired ? (
            <p className="text-warning text-sm">
              Voting deadline has elapsed. Anyone may call <code className="text-accent">expireInheritance(landId)</code> to reset
              the proposal to ACTIVE.
            </p>
          ) : alreadyApproved ? (
            <p className="text-muted text-sm">
              You have approved this proposal. Waiting on {Number(heirs.length) - Number(approvalCount)} more heir(s).
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <button onClick={approve} disabled={isPending || confirming} className="btn-primary py-3">
                {confirming ? "Confirming…" : isPending ? "Awaiting wallet…" : "✓ Approve (sign)"}
              </button>
              <button onClick={dispute} disabled={isPending || confirming} className="btn-secondary py-3">
                ⚠ Dispute (sign)
              </button>
            </div>
          )}

          <p className="text-xs text-muted mt-4">
            Approving signs the proposed redistribution as-shown. If you are the final approver, the contract
            atomically redistributes the deceased&apos;s share across heirs — <strong className="text-foreground">the NFT does not move and
            the tokenId does not change</strong>. Disputing freezes the proposal in legal review until a
            court-anchored RESOLVER resolves with an updated court order, a legal-resolution document, and
            a written reason.
          </p>
        </div>
      </div>
    </main>
  );
}
