"use client";

import { use, useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import Navbar from "@/src/components/Navbar";
import { SharesHashVerifier } from "@/src/components/shared/SharesHashVerifier";
import { CourtOrderPreview } from "@/src/components/shared/CourtOrderPreview";
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS, formatBps } from "@/src/utils/contractV9";

/**
 * Heir vote screen — the headline page of the inheritance portal.
 *
 * Split-pane: court order PDF on the left, proposed (heirs, shares) table
 * on the right, with the SharesHashVerifier as the cryptographic anchor.
 *
 * Designed so a citizen can verify — without trusting the backend — that
 * the on-chain ownership change matches the court order they hold.
 */
export default function VoteScreen({
  params,
}: {
  params: Promise<{ landId: string }>;
}) {
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

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <main className="min-h-screen bg-brand-dark text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto p-8">
          <div className="glass-card p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">Connect your wallet</h1>
            <p className="text-white/60 text-sm">
              You need a connected wallet to view an inheritance proposal.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (reqLoading) {
    return (
      <main className="min-h-screen bg-brand-dark text-white">
        <Navbar />
        <div className="max-w-6xl mx-auto p-8">
          <div className="animate-pulse text-white/60">Loading inheritance proposal…</div>
        </div>
      </main>
    );
  }

  const [
    deceased,
    heirs,
    heirShares,
    approvalCount,
    isExecuted,
    proposalNonce,
    courtOrderCid,
    appealId,
    sharesHash,
    votingDeadline,
  ] = (req ?? []) as readonly [
    `0x${string}`,
    readonly `0x${string}`[],
    readonly number[],
    bigint,
    boolean,
    bigint,
    string,
    bigint,
    `0x${string}`,
    bigint,
  ];

  const noProposal =
    !req || deceased === "0x0000000000000000000000000000000000000000" || heirs.length === 0;

  if (noProposal) {
    return (
      <main className="min-h-screen bg-brand-dark text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto p-8">
          <div className="glass-card p-8 text-center">
            <h1 className="text-xl font-semibold mb-2">No active inheritance proposal</h1>
            <p className="text-white/60 text-sm">
              Land <span className="font-mono">{landId}</span> has no pending inheritance proposal,
              or the v9 contract is not deployed at the configured address yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const isHeir = heirs.some((h) => h.toLowerCase() === me?.toLowerCase());
  const myShareIdx = heirs.findIndex((h) => h.toLowerCase() === me?.toLowerCase());
  const myShareBps = myShareIdx >= 0 ? Number(heirShares[myShareIdx]) : 0;
  const deadlineDate = new Date(Number(votingDeadline) * 1000);
  const expired = Date.now() > deadlineDate.getTime();
  const totalShareBps = heirShares.reduce((a, b) => a + Number(b), 0);

  async function approve() {
    await writeContractAsync({
      abi: CONTRACT_V9_ABI,
      address: CONTRACT_V9_ADDRESS,
      functionName: "approveSuccessionPlan",
      args: [landId],
    });
  }

  async function dispute() {
    await writeContractAsync({
      abi: CONTRACT_V9_ABI,
      address: CONTRACT_V9_ADDRESS,
      functionName: "disputeSuccessionPlan",
      args: [landId],
    });
  }

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <header>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">Inheritance vote</h1>
            <span className="font-mono text-white/60">{landId}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/60 mt-2 flex-wrap">
            <span>Proposal nonce {String(proposalNonce)}</span>
            <span>·</span>
            <span>Deceased <span className="font-mono">{deceased.slice(0, 6)}…{deceased.slice(-4)}</span></span>
            <span>·</span>
            <span>Voting deadline: {deadlineDate.toISOString().slice(0, 10)} {expired && <span className="text-red-300">(EXPIRED)</span>}</span>
            <span>·</span>
            <span>Approvals: {String(approvalCount)} / {heirs.length}</span>
            {isExecuted && <span className="text-green-300">✓ EXECUTED</span>}
          </div>
        </header>

        <div className="grid lg:grid-cols-2 gap-6">
          <CourtOrderPreview cid={courtOrderCid} label="Court order (succession order)" height={520} />

          <div className="space-y-4">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Proposed redistribution</h2>
                <span className="text-xs text-white/50">appeal #{String(appealId)}</span>
              </div>

              <div className="space-y-1.5">
                {heirs.map((h, i) => {
                  const isMe = h.toLowerCase() === me?.toLowerCase();
                  return (
                    <div
                      key={`${h}-${i}`}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                        isMe ? "bg-indigo-500/10 border border-indigo-500/30" : "bg-black/20"
                      }`}
                    >
                      <span className="font-mono text-sm text-white/90">
                        {h.slice(0, 6)}…{h.slice(-4)}
                        {isMe && <span className="ml-2 text-xs text-indigo-300">(you)</span>}
                      </span>
                      <span className="font-mono text-sm tabular-nums">+{formatBps(heirShares[i])}</span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-white/10 mt-2">
                  <span className="text-xs uppercase tracking-wider text-white/50">Sum (must equal deceased's bps)</span>
                  <span className="font-mono text-sm tabular-nums">{formatBps(totalShareBps)}</span>
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
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold mb-2">Your action</h2>
          {!isHeir ? (
            <p className="text-white/60 text-sm">
              You are not a named heir on this proposal. You can read but not vote.
            </p>
          ) : isExecuted ? (
            <p className="text-green-300 text-sm">
              Proposal already executed. Your new share is {formatBps(myShareBps)}.
            </p>
          ) : expired ? (
            <p className="text-yellow-300 text-sm">
              Voting deadline has elapsed. Anyone may call <code>expireInheritance(landId)</code> to reset
              the proposal to ACTIVE.
            </p>
          ) : alreadyApproved ? (
            <p className="text-white/70 text-sm">
              You have approved this proposal. Waiting on {Number(heirs.length) - Number(approvalCount)} more heir(s).
            </p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <button
                onClick={approve}
                disabled={isPending || confirming}
                className="btn-primary py-3"
              >
                {confirming ? "Confirming…" : isPending ? "Awaiting wallet…" : "✓ Approve (sign)"}
              </button>
              <button
                onClick={dispute}
                disabled={isPending || confirming}
                className="btn-secondary py-3"
              >
                ⚠ Dispute (sign)
              </button>
            </div>
          )}

          <p className="text-xs text-white/50 mt-4">
            Approving signs the proposed redistribution as-shown. If you are the final approver, the contract
            atomically redistributes the deceased&apos;s share across heirs — <strong>the NFT does not move and
            the tokenId does not change</strong>. Disputing freezes the proposal in legal review until a
            court-anchored RESOLVER resolves with an updated court order, a legal-resolution document, and
            a written reason.
          </p>
        </div>
      </div>
    </main>
  );
}
