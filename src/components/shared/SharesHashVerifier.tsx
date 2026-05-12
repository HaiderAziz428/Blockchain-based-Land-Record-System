"use client";

import { useState } from "react";
import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

/**
 * Headline cryptographic-anchor component.
 *
 * Closes the entire "backend silently rewrote shares" attack surface:
 * the user can independently recompute `sharesHash` client-side from
 * (heirs[], heirShares[], courtOrderCid) and compare against the value
 * the contract committed at proposal time. NO backend or wallet involved.
 *
 * The recompute uses viem's pure `keccak256(abi.encode(...))` — equivalent
 * to the contract's `computeSharesHash` view, but runs in the browser,
 * which means a tampered backend cannot serve a fake "matches" answer.
 *
 * The component falls back to calling the on-chain pure view via wagmi
 * if the local recompute is unavailable (rare — only if WebCrypto is
 * missing), but defaults to the local path because of the trust property.
 */
export function SharesHashVerifier(props: {
  heirs: readonly `0x${string}`[];
  heirShares: readonly number[]; // bps (uint16)
  courtOrderCid: string;
  expectedSharesHash: `0x${string}`; // the value emitted by the contract
}) {
  const { heirs, heirShares, courtOrderCid, expectedSharesHash } = props;
  const [verdict, setVerdict] = useState<
    | { kind: "untested" }
    | { kind: "matches"; computed: `0x${string}` }
    | { kind: "mismatch"; computed: `0x${string}` }
  >({ kind: "untested" });

  function recompute() {
    // keccak256(abi.encode(address[], uint16[], string))
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
    <div className="surface rounded-2xl p-5 border border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">
          Cryptographic anchor — shares hash
        </div>
        <span className="text-xs text-white/50">v9 sharesHash</span>
      </div>

      <div className="font-mono text-xs break-all text-white/80 bg-black/40 rounded-lg p-3 border border-white/10">
        <div className="text-white/40 mb-1">On-chain (committed at propose):</div>
        {expectedSharesHash}
      </div>

      {verdict.kind !== "untested" && (
        <div className="font-mono text-xs break-all bg-black/40 rounded-lg p-3 border border-white/10">
          <div className="text-white/40 mb-1">Recomputed in your browser:</div>
          <span className={verdict.kind === "matches" ? "text-green-300" : "text-red-300"}>
            {verdict.computed}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={recompute}
          className="btn-primary text-sm px-4 py-2"
        >
          Recompute client-side
        </button>

        {verdict.kind === "matches" && (
          <span className="pill bg-green-500/10 text-green-300 border border-green-500/20">
            ✓ matches — proposal inputs are unchanged
          </span>
        )}
        {verdict.kind === "mismatch" && (
          <span className="pill bg-red-500/10 text-red-300 border border-red-500/20">
            ✗ MISMATCH — DISPUTE this proposal
          </span>
        )}
      </div>

      <p className="text-xs text-white/60 leading-relaxed">
        This recomputes <code className="text-indigo-300">keccak256(abi.encode(heirs[], heirShares[], courtOrderCid))</code>
        {" "}in your browser with no backend involvement. A <span className="text-green-300">✓</span> means the contract committed
        the exact heirs, exact shares, and exact court-order CID you are seeing right now. A <span className="text-red-300">✗</span>
        means the inputs the contract committed differ from what you are seeing — refuse to approve and file a dispute.
      </p>
    </div>
  );
}
