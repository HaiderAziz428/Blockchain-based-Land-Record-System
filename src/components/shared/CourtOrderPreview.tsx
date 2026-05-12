"use client";

import { useEffect, useState } from "react";

const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs",
  "https://ipfs.io/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
];

type SignalKind = "untested" | "matches" | "mismatch";

/**
 * Renders an IPFS-pinned legal document with a citizen-runnable
 * "Verify locally" affordance that compares the gateway-served sha256
 * to a local file the user picks. If a citizen has the same PDF the
 * registrar uploaded, they can independently verify the CID hasn't
 * been swapped.
 */
export function CourtOrderPreview(props: {
  cid: string;
  label?: string;
  height?: number;
}) {
  const { cid, label = "Court order", height = 480 } = props;

  const [gatewayUrl, setGatewayUrl] = useState<string>(`${GATEWAYS[0]}/${cid}`);
  const [gatewaySha, setGatewaySha] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<SignalKind>("untested");

  // Compute sha256 of the gateway-served bytes on mount.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      for (const g of GATEWAYS) {
        try {
          const r = await fetch(`${g}/${cid}`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) continue;
          const buf = await r.arrayBuffer();
          const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
          const hex = Array.from(hashBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
          if (cancelled) return;
          setGatewayUrl(`${g}/${cid}`);
          setGatewaySha(hex);
          return;
        } catch {
          /* try next */
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [cid]);

  async function verifyLocally(file: File) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
    const hex = Array.from(hashBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (gatewaySha == null) return;
    setVerifyResult(hex === gatewaySha ? "matches" : "mismatch");
  }

  return (
    <div className="surface rounded-2xl p-5 border border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">{label}</div>
        <a
          href={gatewayUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-300 hover:text-indigo-200"
        >
          Open on IPFS gateway ↗
        </a>
      </div>

      <iframe
        title={label}
        src={gatewayUrl}
        className="w-full rounded-lg border border-white/10 bg-black/40"
        style={{ height }}
      />

      <div className="text-xs text-white/60 font-mono break-all">
        <div>CID: <span className="text-white/80">{cid}</span></div>
        <div>
          sha256 (gateway):{" "}
          <span className="text-white/80">{gatewaySha ?? "loading…"}</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="btn-secondary text-sm px-4 py-2 cursor-pointer">
          Verify locally
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void verifyLocally(f);
            }}
          />
        </label>
        {verifyResult === "matches" && (
          <span className="pill bg-green-500/10 text-green-300 border border-green-500/20">
            ✓ Your local file matches the on-chain CID
          </span>
        )}
        {verifyResult === "mismatch" && (
          <span className="pill bg-red-500/10 text-red-300 border border-red-500/20">
            ✗ MISMATCH — the gateway is serving different content
          </span>
        )}
      </div>
    </div>
  );
}
