"use client";

import { useReadContract } from "wagmi";
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS, formatBps } from "@/src/utils/contractV9";

/**
 * Layer-2 ownership snapshot — the "who owns what fraction" table.
 *
 * Reads `getShareholdersWithBps(landId)` from the v9 contract. Renders
 * the share ledger as the primary fact (NOT the ERC-721 tokenId).
 */
export function OwnershipPanel({
  landId,
  highlightAddress,
}: {
  landId: string;
  highlightAddress?: `0x${string}`;
}) {
  const { data, isLoading, error } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getShareholdersWithBps",
    args: [landId],
  });

  if (isLoading) {
    return (
      <div className="surface rounded-2xl p-6 border border-white/10 animate-pulse">
        <div className="h-4 w-40 bg-white/10 rounded mb-3" />
        <div className="h-8 w-full bg-white/10 rounded mb-2" />
        <div className="h-8 w-full bg-white/10 rounded mb-2" />
        <div className="h-8 w-full bg-white/10 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface rounded-2xl p-6 border border-red-500/20 bg-red-500/5">
        <div className="text-sm text-red-300">
          Could not load shareholders. The deployed contract may be the legacy
          v3 — v9 reads will fail until v9 is deployed.
        </div>
      </div>
    );
  }

  const [holders = [], shares = []] = (data ?? [[], []]) as readonly [
    readonly `0x${string}`[],
    readonly number[],
  ];

  const total = shares.reduce((a, b) => a + Number(b), 0);
  const sortedIdx = [...holders.keys()].sort((a, b) => Number(shares[b]) - Number(shares[a]));

  return (
    <div className="surface rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-white">
          Ownership <span className="text-white/40 text-xs">(layer 2 — share ledger)</span>
        </div>
        <div className="pill bg-white/5 text-white/70 border border-white/10">
          {holders.length} co-owner{holders.length === 1 ? "" : "s"}
        </div>
      </div>

      {holders.length === 0 ? (
        <div className="text-white/50 text-sm">
          No shareholders. Land may be in PENDING_VERIFICATION or already SUBDIVIDED.
        </div>
      ) : (
        <div className="space-y-2">
          {sortedIdx.map((i) => {
            const h = holders[i];
            const bps = Number(shares[i]);
            const isMe = highlightAddress && h.toLowerCase() === highlightAddress.toLowerCase();
            return (
              <div
                key={h}
                className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
                  isMe ? "bg-indigo-500/10 border-indigo-500/30" : "bg-black/20 border-white/5"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="w-2 h-2 rounded-full bg-indigo-400 shrink-0"
                    style={{ opacity: 0.3 + (bps / 10000) * 0.7 }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-white/90 truncate">
                      {h.slice(0, 6)}…{h.slice(-4)}
                      {isMe && <span className="ml-2 text-xs text-indigo-300">(you)</span>}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-sm tabular-nums text-white">
                  {formatBps(bps)}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-lg px-3 py-2 mt-3 border border-white/10">
            <span className="text-xs text-white/50 uppercase tracking-wider">Total</span>
            <span className={`font-mono text-sm tabular-nums ${total === 10000 ? "text-green-300" : "text-yellow-300"}`}>
              {formatBps(total)} {total === 10000 ? "✓" : "⚠ invariant broken"}
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-white/50 mt-4">
        Ownership is recorded as basis points (10,000 = 100%) in the layer-2 share ledger.
        Changing shares does NOT move the NFT — the tokenId is permanent.
      </p>
    </div>
  );
}
