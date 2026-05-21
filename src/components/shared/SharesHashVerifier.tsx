"use client";

import { useState } from "react";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

export function SharesHashVerifier(props: {
  heirs: readonly `0x${string}`[];
  heirShares: readonly number[];
  courtOrderCid: string;
  expectedSharesHash: `0x${string}`;
}) {
  const { heirs, heirShares, courtOrderCid, expectedSharesHash } = props;
  const [verdict, setVerdict] = useState<
    | { kind: "untested" }
    | { kind: "matches"; computed: `0x${string}` }
    | { kind: "mismatch"; computed: `0x${string}` }
  >({ kind: "untested" });

  function recompute() {
    const encoded = encodeAbiParameters(
      parseAbiParameters("address[], uint16[], string"),
      [
        heirs as readonly `0x${string}`[],
        heirShares.map((n) => Number(n)) as unknown as readonly number[],
        courtOrderCid,
      ],
    );
    const computed = keccak256(encoded) as `0x${string}`;
    const ok = computed.toLowerCase() === expectedSharesHash.toLowerCase();
    setVerdict({ kind: ok ? "matches" : "mismatch", computed });
  }

  return (
    <div className="surface rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">Cryptographic anchor — shares hash</div>
        <span className="text-xs text-muted">v9 sharesHash</span>
      </div>

      <div className="font-mono text-xs break-all text-foreground bg-surface-elevated rounded-lg p-3 border border-border">
        <div className="text-muted mb-1">On-chain (committed at propose):</div>
        {expectedSharesHash}
      </div>

      {verdict.kind !== "untested" && (
        <div className="font-mono text-xs break-all bg-surface-elevated rounded-lg p-3 border border-border">
          <div className="text-muted mb-1">Recomputed in your browser:</div>
          <span className={verdict.kind === "matches" ? "text-success" : "text-danger"}>
            {verdict.computed}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={recompute} className="btn-primary text-sm px-4 py-2">
          Recompute client-side
        </button>
        {verdict.kind === "matches" && (
          <span className="pill bg-success/10 text-success border border-success/20">
            ✓ matches — proposal inputs are unchanged
          </span>
        )}
        {verdict.kind === "mismatch" && (
          <span className="pill bg-danger/10 text-danger border border-danger/20">
            ✗ MISMATCH — DISPUTE this proposal
          </span>
        )}
      </div>

      <p className="text-xs text-muted leading-relaxed">
        This recomputes <code className="text-accent">keccak256(abi.encode(heirs[], heirShares[], courtOrderCid))</code>
        {" "}in your browser with no backend involvement. A <span className="text-success">✓</span> means the contract committed
        the exact heirs, exact shares, and exact court-order CID you are seeing right now. A <span className="text-danger">✗</span>
        means the inputs the contract committed differ from what you are seeing — refuse to approve and file a dispute.
      </p>
    </div>
  );
}
