'use client';

import { useState } from 'react';
import { usePublicClient } from 'wagmi';
import Navbar from '@/src/components/Navbar';
import {
  CONTRACT_V9_ABI,
  CONTRACT_V9_ADDRESS,
  LandStatusV9,
  LandTypeV9,
  formatBps,
  landStatusLabel,
  landTypeLabel,
} from '@/src/utils/contractV9';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { formatEther } from 'viem';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

const STATUS_META: Record<number, { tone: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  [LandStatusV9.PENDING_VERIFICATION]:       { tone: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', Icon: Clock },
  [LandStatusV9.ACTIVE]:                     { tone: 'bg-green-500/10 text-green-400 border-green-500/20',  Icon: CheckCircle2 },
  [LandStatusV9.PENDING_INHERITANCE]:        { tone: 'bg-orange-500/10 text-orange-400 border-orange-500/20', Icon: Clock },
  [LandStatusV9.PENDING_SUBDIVISION]:        { tone: 'bg-blue-500/10 text-blue-400 border-blue-500/20',   Icon: Clock },
  [LandStatusV9.LOCKED_IMPORT_DISPUTE]:      { tone: 'bg-red-500/10 text-red-400 border-red-500/20',     Icon: ShieldAlert },
  [LandStatusV9.LOCKED_INHERITANCE_DISPUTE]: { tone: 'bg-red-500/10 text-red-400 border-red-500/20',     Icon: ShieldAlert },
  [LandStatusV9.LOCKED_SUBDIVISION_DISPUTE]: { tone: 'bg-red-500/10 text-red-400 border-red-500/20',     Icon: ShieldAlert },
  [LandStatusV9.SUBDIVIDED]:                 { tone: 'bg-gray-500/10 text-gray-400 border-gray-500/20',  Icon: ShieldCheck },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type LandRecord = {
  landId: string;
  ipfsHash: string;
  landType: number;
  status: number;
  proposedAt: bigint;
  verifiedAt: bigint;
};

type UserProfile = { name: string; cnic: string; isRegistered: boolean };

type Shareholder = {
  address: string;
  bps: number;
  profile?: UserProfile;
};

type OwnershipChange = {
  from: string;
  to: string;
  shareBps: number;
  timestamp: bigint;
  price: bigint;
};

type ImportProposal = {
  proposer: string;
  proposedOwners: string[];
  proposedShares: number[];
  verificationCount: bigint;
  courtOrderCid: string;
  verificationDeadline: bigint;
};

type InheritanceRequest = {
  deceasedHolder: string;
  heirs: string[];
  heirShares: number[];
  approvalCount: bigint;
  isExecuted: boolean;
  courtOrderCid: string;
  votingDeadline: bigint;
};

type SubdivisionPlan = {
  newLandIds: string[];
  courtOrderCid: string;
  approvalCount: bigint;
  isExecuted: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ZERO = '0x0000000000000000000000000000000000000000';

function maskCnic(cnic: string) {
  if (!cnic || cnic.length < 5) return cnic;
  return cnic.slice(0, 5) + '-XXXXX-X';
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function fmtDate(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function VerifyPage() {
  const [searchId, setSearchId] = useState('');
  const [queriedId, setQueriedId] = useState('');
  const [record, setRecord] = useState<LandRecord | null>(null);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [history, setHistory] = useState<OwnershipChange[]>([]);
  const [importProposal, setImportProposal] = useState<ImportProposal | null>(null);
  const [inheritanceRequest, setInheritanceRequest] = useState<InheritanceRequest | null>(null);
  const [subdivisionPlan, setSubdivisionPlan] = useState<SubdivisionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publicClient = usePublicClient();

  // Resolve a wallet address to its registered name (best-effort)
  const resolveUser = async (addr: string): Promise<UserProfile | undefined> => {
    if (!publicClient || !addr || addr === ZERO) return undefined;
    try {
      return (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getUser',
        args: [addr as `0x${string}`],
      })) as UserProfile;
    } catch { return undefined; }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = searchId.trim();
    if (!id || !publicClient) return;

    setQueriedId(id);
    setIsLoading(true);
    setError(null);
    setRecord(null);
    setShareholders([]);
    setHistory([]);
    setImportProposal(null);
    setInheritanceRequest(null);
    setSubdivisionPlan(null);

    try {
      // ── 1. Core land record ───────────────────────────────────────────────
      const r = (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getLandRecord',
        args: [id],
      })) as LandRecord;

      if (!r.landId || r.landId === '') {
        setError('Land not found. Check the Land ID and try again.');
        setIsLoading(false);
        return;
      }
      setRecord(r);

      // ── 2. Current shareholders + their registered names ──────────────────
      try {
        const holders = (await publicClient.readContract({
          address: CONTRACT_V9_ADDRESS,
          abi: CONTRACT_V9_ABI,
          functionName: 'getShareholders',
          args: [id],
        })) as string[];

        const withDetails = await Promise.all(
          holders.map(async (addr): Promise<Shareholder> => {
            const [bps, profile] = await Promise.all([
              publicClient.readContract({
                address: CONTRACT_V9_ADDRESS,
                abi: CONTRACT_V9_ABI,
                functionName: 'getShareBps',
                args: [id, addr as `0x${string}`],
              }) as Promise<number>,
              resolveUser(addr),
            ]);
            return { address: addr, bps: Number(bps), profile };
          })
        );
        setShareholders(withDetails);
      } catch { /* non-critical */ }

      // ── 3. Full ownership history ─────────────────────────────────────────
      try {
        const raw = (await publicClient.readContract({
          address: CONTRACT_V9_ADDRESS,
          abi: CONTRACT_V9_ABI,
          functionName: 'getOwnershipHistory',
          args: [id],
        })) as OwnershipChange[];
        setHistory(raw);
      } catch { /* non-critical */ }

      // ── 4. Status-specific supplemental data ─────────────────────────────
      if (r.status === LandStatusV9.PENDING_VERIFICATION || r.status === LandStatusV9.LOCKED_IMPORT_DISPUTE) {
        try {
          const raw = (await publicClient.readContract({
            address: CONTRACT_V9_ADDRESS,
            abi: CONTRACT_V9_ABI,
            functionName: 'getImportProposal',
            args: [id],
          })) as readonly [string, string[], number[], bigint, string, bigint, bigint, boolean];
          const [proposer, proposedOwners, proposedShares, verificationCount, courtOrderCid, , verificationDeadline] = raw;
          setImportProposal({ proposer, proposedOwners: [...proposedOwners], proposedShares: [...proposedShares], verificationCount, courtOrderCid, verificationDeadline });
        } catch { /* no proposal */ }
      }

      if (r.status === LandStatusV9.PENDING_INHERITANCE || r.status === LandStatusV9.LOCKED_INHERITANCE_DISPUTE) {
        try {
          const raw = (await publicClient.readContract({
            address: CONTRACT_V9_ADDRESS,
            abi: CONTRACT_V9_ABI,
            functionName: 'getInheritanceRequest',
            args: [id],
          })) as readonly [string, string[], number[], bigint, boolean, bigint, string, bigint, `0x${string}`, bigint];
          const [deceasedHolder, heirs, heirShares, approvalCount, isExecuted, , courtOrderCid, , , votingDeadline] = raw;
          setInheritanceRequest({ deceasedHolder, heirs: [...heirs], heirShares: [...heirShares], approvalCount, isExecuted, courtOrderCid, votingDeadline });
        } catch { /* no inheritance */ }
      }

      if (r.status === LandStatusV9.PENDING_SUBDIVISION || r.status === LandStatusV9.LOCKED_SUBDIVISION_DISPUTE) {
        try {
          const raw = (await publicClient.readContract({
            address: CONTRACT_V9_ADDRESS,
            abi: CONTRACT_V9_ABI,
            functionName: 'getSubdivisionPlan',
            args: [id],
          })) as readonly [string[], string[], string, string, bigint, boolean, bigint];
          const [newLandIds, , courtOrderCid, , approvalCount, isExecuted] = raw;
          setSubdivisionPlan({ newLandIds: [...newLandIds], courtOrderCid, approvalCount, isExecuted });
        } catch { /* no subdivision */ }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Contract error. Check the Land ID and try again.');
    }
    setIsLoading(false);
  };

  const statusMeta = record !== null ? STATUS_META[record.status] : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto p-6 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck size={24} className="text-indigo-400" />
            Public Land Verification
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Look up any land record by Land ID. No wallet required. Ownership and history are on-chain and tamper-proof.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="field flex-1"
            placeholder="e.g. DHA-P9-042"
          />
          <button type="submit" disabled={isLoading || !searchId.trim()} className="btn-primary px-6 flex items-center gap-2">
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Verify
          </button>
        </form>

        {error && (
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-red-500/10 border-red-500/20 text-red-300 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {record && (
          <div className="space-y-5">

            {/* ── Core record ──────────────────────────────────────────────── */}
            <div className="glass-card p-6 rounded-2xl space-y-5">

              {/* Top row: Land ID + status pill */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-white/40 mb-0.5">Land ID</p>
                  <p className="font-mono text-xl text-white">{record.landId}</p>
                  <p className="text-sm text-white/50 mt-0.5">{landTypeLabel(record.landType as LandTypeV9)}</p>
                </div>
                {statusMeta && (
                  <span className={`pill border text-xs ${statusMeta.tone}`}>
                    <statusMeta.Icon size={11} className="inline mr-1" />
                    {landStatusLabel(record.status as LandStatusV9)}
                  </span>
                )}
              </div>

              {/* Government verification badge */}
              {record.verifiedAt > BigInt(0) && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                  <CheckCircle2 size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-green-300 font-semibold text-sm">Government Verified</p>
                    <p className="text-green-400/70 text-xs mt-0.5">
                      This land was verified and minted on-chain at{' '}
                      <span className="text-green-300">{fmtDate(record.verifiedAt)}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Proposed but not yet verified */}
              {record.proposedAt > BigInt(0) && record.verifiedAt === BigInt(0) && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                  <Clock size={18} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-yellow-300 font-semibold text-sm">Pending Verification</p>
                    <p className="text-yellow-400/70 text-xs mt-0.5">
                      Proposed at <span className="text-yellow-300">{fmtDate(record.proposedAt)}</span>.
                      Awaiting shareholder confirmations.
                    </p>
                  </div>
                </div>
              )}

              {/* Deed document link */}
              {record.ipfsHash && (
                <a
                  href={`${IPFS_GATEWAY}/${record.ipfsHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <FileText size={15} />
                  View Deed Document on IPFS
                  <ExternalLink size={12} />
                </a>
              )}
            </div>

            {/* ── Current Ownership ─────────────────────────────────────────── */}
            {shareholders.length > 0 && (
              <div className="glass-card p-6 rounded-2xl space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <Users size={16} className="text-indigo-400" />
                  Current Ownership
                </h2>
                <div className="space-y-3">
                  {shareholders.map((s) => (
                    <div key={s.address} className="surface p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
                      <div>
                        {s.profile?.isRegistered ? (
                          <>
                            <p className="text-sm text-white font-medium">{s.profile.name}</p>
                            <p className="text-xs text-white/40 font-mono mt-0.5">
                              CNIC {maskCnic(s.profile.cnic)}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-mono text-white/60">{shortAddr(s.address)}</p>
                        )}
                        <p className="text-xs text-white/30 font-mono mt-0.5">{shortAddr(s.address)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-indigo-400 font-bold text-lg">{formatBps(s.bps)}</p>
                        <p className="text-xs text-white/30">{s.bps} bps</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Chain of Title ────────────────────────────────────────────── */}
            {history.length > 0 && (
              <div className="glass-card p-6 rounded-2xl space-y-4">
                <h2 className="font-semibold flex items-center gap-2">
                  <ShieldCheck size={16} className="text-indigo-400" />
                  Chain of Title
                  <span className="text-xs text-white/30 font-normal ml-1">— complete tamper-proof history</span>
                </h2>

                <div className="relative">
                  {/* Vertical timeline line */}
                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />

                  <div className="space-y-5">
                    {history.map((h, i) => {
                      const isMint = h.from === ZERO || h.from === '0x0000000000000000000000000000000000000000';
                      const isFirst = i === 0;
                      const isPaid = h.price > BigInt(0);

                      return (
                        <div key={i} className="flex gap-4">
                          {/* Timeline dot */}
                          <div className="relative flex-shrink-0 mt-1">
                            <div className={`w-3.5 h-3.5 rounded-full border-2 z-10 relative ${
                              isMint
                                ? 'bg-green-500 border-green-400'
                                : isPaid
                                ? 'bg-indigo-500 border-indigo-400'
                                : 'bg-white/20 border-white/30'
                            }`} />
                          </div>

                          {/* Event content */}
                          <div className="flex-1 pb-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                {isMint ? (
                                  <p className="text-sm text-white font-medium">
                                    Govt verified &amp; minted
                                    {isFirst && ' — Land first registered on-chain'}
                                  </p>
                                ) : (
                                  <p className="text-sm text-white font-medium">
                                    {isPaid ? 'Sold' : 'Transferred'}{' '}
                                    <span className="text-indigo-400">{formatBps(h.shareBps)}</span>
                                    {isPaid
                                      ? ` for ${formatEther(h.price)} ETH`
                                      : ' (gift / free transfer)'}
                                  </p>
                                )}

                                {/* From → To */}
                                {!isMint && (
                                  <div className="flex items-center gap-1.5 mt-1 text-xs text-white/50">
                                    <span className="font-mono">{shortAddr(h.from)}</span>
                                    <ArrowRight size={10} />
                                    <span className="font-mono">{shortAddr(h.to)}</span>
                                  </div>
                                )}
                                {isMint && (
                                  <div className="text-xs text-white/50 mt-1 font-mono">
                                    → {shortAddr(h.to)}
                                  </div>
                                )}
                              </div>

                              <div className="text-right">
                                <p className="text-xs text-white/40">{fmtDate(h.timestamp)}</p>
                                {isPaid && (
                                  <p className="text-xs text-indigo-400 font-mono mt-0.5">
                                    {formatEther(h.price)} ETH
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── Import proposal (PENDING_VERIFICATION / dispute) ──────────── */}
            {importProposal && (
              <div className="glass-card p-6 rounded-2xl space-y-3">
                <h2 className="font-semibold text-yellow-400">Import Proposal</h2>
                <div className="text-xs text-white/50 space-y-1">
                  <p>Verifications: {String(importProposal.verificationCount)} / {importProposal.proposedOwners.length}</p>
                  <p>Deadline: {fmtDate(importProposal.verificationDeadline)}</p>
                </div>
                {importProposal.courtOrderCid && (
                  <a href={`${IPFS_GATEWAY}/${importProposal.courtOrderCid}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:underline">
                    <ExternalLink size={11} /> Court order
                  </a>
                )}
                <div className="space-y-1.5">
                  {importProposal.proposedOwners.map((addr, i) => (
                    <div key={addr} className="flex justify-between text-xs font-mono text-white/60">
                      <span>{shortAddr(addr)}</span>
                      <span className="text-indigo-400">{formatBps(importProposal.proposedShares[i])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Inheritance request ───────────────────────────────────────── */}
            {inheritanceRequest && (
              <div className="glass-card p-6 rounded-2xl space-y-3">
                <h2 className="font-semibold text-orange-400">Inheritance Request</h2>
                <div className="text-xs text-white/50 space-y-1">
                  <p>Deceased: <span className="font-mono">{shortAddr(inheritanceRequest.deceasedHolder)}</span></p>
                  <p>Approvals: {String(inheritanceRequest.approvalCount)} / {inheritanceRequest.heirs.length}</p>
                  <p>Deadline: {fmtDate(inheritanceRequest.votingDeadline)}</p>
                  <p>Status: <span className={inheritanceRequest.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                    {inheritanceRequest.isExecuted ? 'Executed' : 'Pending votes'}
                  </span></p>
                </div>
                {inheritanceRequest.courtOrderCid && (
                  <a href={`${IPFS_GATEWAY}/${inheritanceRequest.courtOrderCid}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:underline">
                    <ExternalLink size={11} /> Court order
                  </a>
                )}
                <div className="space-y-1.5">
                  {inheritanceRequest.heirs.map((heir, i) => (
                    <div key={heir} className="flex justify-between text-xs font-mono text-white/60">
                      <span>{shortAddr(heir)}</span>
                      <span className="text-indigo-400">{formatBps(inheritanceRequest.heirShares[i])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Subdivision plan ──────────────────────────────────────────── */}
            {subdivisionPlan && (
              <div className="glass-card p-6 rounded-2xl space-y-3">
                <h2 className="font-semibold text-blue-400">Subdivision Plan</h2>
                <div className="text-xs text-white/50 space-y-1">
                  <p>Approvals: {String(subdivisionPlan.approvalCount)}</p>
                  <p>Status: <span className={subdivisionPlan.isExecuted ? 'text-green-400' : 'text-yellow-400'}>
                    {subdivisionPlan.isExecuted ? 'Executed' : 'Pending votes'}
                  </span></p>
                </div>
                {subdivisionPlan.courtOrderCid && (
                  <a href={`${IPFS_GATEWAY}/${subdivisionPlan.courtOrderCid}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:underline">
                    <ExternalLink size={11} /> Court order
                  </a>
                )}
                <div>
                  <p className="text-xs text-white/40 mb-1.5">Proposed child plots:</p>
                  <div className="space-y-1">
                    {subdivisionPlan.newLandIds.map((id) => (
                      <p key={id} className="text-xs font-mono text-indigo-400">{id}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* Empty state after search */}
        {!isLoading && queriedId && !record && !error && (
          <div className="glass-card p-10 rounded-2xl text-center text-white/40">
            No land found for <span className="font-mono text-white/60">{queriedId}</span>
          </div>
        )}

      </div>
    </main>
  );
}
