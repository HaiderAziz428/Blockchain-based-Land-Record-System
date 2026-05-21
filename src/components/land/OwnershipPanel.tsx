"use client";

import { useReadContract } from "wagmi";
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS, formatBps } from "@/src/utils/contractV9";

export function OwnershipPanel({ landId, highlightAddress }: { landId: string; highlightAddress?: `0x${string}` }) {
  const { data, isLoading, error } = useReadContract({
    abi: CONTRACT_V9_ABI,
    address: CONTRACT_V9_ADDRESS,
    functionName: "getShareholdersWithBps",
    args: [landId],
  });

  if (isLoading) {
    return (
      <div className="surface rounded-2xl p-6 animate-pulse">
        <div className="h-4 w-40 bg-border rounded mb-3" />
        <div className="h-8 w-full bg-border rounded mb-2" />
        <div className="h-8 w-full bg-border rounded mb-2" />
        <div className="h-8 w-full bg-border rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="surface rounded-2xl p-6 border border-danger/20 bg-danger/5">
        <div className="text-sm text-danger">
          Could not load shareholders. The deployed contract may be the legacy v3 — v9 reads will fail until v9 is deployed.
        </div>
      </div>
    );
  }

  const [holders = [], shares = []] = (data ?? [[], []]) as readonly [readonly `0x${string}`[], readonly number[]];
  const total = shares.reduce((a, b) => a + Number(b), 0);
  const sortedIdx = [...holders.keys()].sort((a, b) => Number(shares[b]) - Number(shares[a]));

  return (
    <div className="surface rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold text-foreground">
          Ownership <span className="text-muted text-xs">(layer 2 — share ledger)</span>
        </div>
        <div className="pill bg-surface-elevated text-muted border border-border">
          {holders.length} co-owner{holders.length === 1 ? "" : "s"}
        </div>
      </div>

      {holders.length === 0 ? (
        <div className="text-muted text-sm">
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
                  isMe ? "bg-accent/10 border-accent/20" : "bg-surface-elevated border-border"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    aria-hidden
                    className="w-2 h-2 rounded-full bg-accent shrink-0"
                    style={{ opacity: 0.3 + (bps / 10000) * 0.7 }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-mono text-foreground truncate">
                      {h.slice(0, 6)}…{h.slice(-4)}
                      {isMe && <span className="ml-2 text-xs text-accent">(you)</span>}
                    </div>
                  </div>
                </div>
                <div className="font-mono text-sm tabular-nums text-foreground">
                  {formatBps(bps)}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-lg px-3 py-2 mt-3 border border-border">
            <span className="text-xs text-muted uppercase tracking-wider">Total</span>
            <span className={`font-mono text-sm tabular-nums ${total === 10000 ? "text-success" : "text-warning"}`}>
              {formatBps(total)} {total === 10000 ? "✓" : "⚠ invariant broken"}
            </span>
          </div>
        </div>
      )}

      <p className="text-xs text-muted mt-4">
        Ownership is recorded as basis points (10,000 = 100%) in the layer-2 share ledger.
        Changing shares does NOT move the NFT — the tokenId is permanent.
      </p>
    </div>
  );
}
