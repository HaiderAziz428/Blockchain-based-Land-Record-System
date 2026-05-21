"use client";

import { useEffect, useState } from "react";

const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs",
  "https://ipfs.io/ipfs",
  "https://cloudflare-ipfs.com/ipfs",
];

type SignalKind = "untested" | "matches" | "mismatch";

export function CourtOrderPreview(props: { cid: string; label?: string; height?: number }) {
  const { cid, label = "Court order", height = 480 } = props;

  const [gatewayUrl, setGatewayUrl] = useState<string>(`${GATEWAYS[0]}/${cid}`);
  const [gatewaySha, setGatewaySha] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<SignalKind>("untested");

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
        } catch { /* try next */ }
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
    <div className="surface rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{label}</div>
        <a href={gatewayUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:text-accent-hover transition-colors">
          Open on IPFS gateway ↗
        </a>
      </div>

      <iframe
        title={label}
        src={gatewayUrl}
        className="w-full rounded-lg border border-border bg-surface"
        style={{ height }}
      />

      <div className="text-xs text-muted font-mono break-all">
        <div>CID: <span className="text-foreground">{cid}</span></div>
        <div>sha256 (gateway): <span className="text-foreground">{gatewaySha ?? "loading…"}</span></div>
      </div>

      <div className="flex items-center gap-3">
        <label className="btn-secondary text-sm px-4 py-2 cursor-pointer">
          Verify locally
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void verifyLocally(f); }}
          />
        </label>
        {verifyResult === "matches" && (
          <span className="pill bg-success/10 text-success border border-success/20">
            ✓ Your local file matches the on-chain CID
          </span>
        )}
        {verifyResult === "mismatch" && (
          <span className="pill bg-danger/10 text-danger border border-danger/20">
            ✗ MISMATCH — the gateway is serving different content
          </span>
        )}
      </div>
    </div>
  );
}
