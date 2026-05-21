'use client';

import { useEffect, useRef, useState } from 'react';
import AdminGuard from '@/src/components/guards/AdminGuard';
import Navbar from '@/src/components/Navbar';
import TxToast from '@/src/components/TxToast';
import {
  useAccount,
  useReadContract,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import {
  CONTRACT_V9_ABI,
  CONTRACT_V9_ADDRESS,
  LandStatusV9,
  LandTypeV9,
  landStatusLabel,
  landTypeLabel,
} from '@/src/utils/contractV9';
import {
  ADMIN_ROLE,
  REGISTRAR_ROLE,
  RESOLVER_ROLE,
  PAUSER_ROLE,
} from '@/src/utils/roleConstants';
import {
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'import' | 'lands' | 'inheritance' | 'dispute' | 'subdivision' | 'roles';

interface OwnerEntry { address: string; shareBps: string; }

interface HeirEntry { address: string; shareBps: string; }

interface ChildEntry {
  landId: string;
  ipfsHash: string;
  owners: OwnerEntry[];
}

const STATUS_TONE: Record<number, string> = {
  [LandStatusV9.PENDING_VERIFICATION]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  [LandStatusV9.ACTIVE]: 'bg-green-500/10 text-green-400 border-green-500/20',
  [LandStatusV9.PENDING_INHERITANCE]: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  [LandStatusV9.PENDING_SUBDIVISION]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  [LandStatusV9.LOCKED_IMPORT_DISPUTE]: 'bg-red-500/10 text-red-400 border-red-500/20',
  [LandStatusV9.LOCKED_INHERITANCE_DISPUTE]: 'bg-red-500/10 text-red-400 border-red-500/20',
  [LandStatusV9.LOCKED_SUBDIVISION_DISPUTE]: 'bg-red-500/10 text-red-400 border-red-500/20',
  [LandStatusV9.SUBDIVIDED]: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
};

function ownerTotal(owners: OwnerEntry[]) {
  return owners.reduce((s, o) => s + (parseInt(o.shareBps) || 0), 0);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function AdminDashboardInner() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [tab, setTab] = useState<Tab>('import');
  const [txToast, setTxToast] = useState<{ hash: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info' | 'success'; message: string } | null>(null);

  // ── Role reads ────────────────────────────────────────────────────────────
  const { data: isAdmin } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'hasRole',
    args: [ADMIN_ROLE, address!],
    query: { enabled: !!address && mounted },
  });
  const { data: isRegistrar } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'hasRole',
    args: [REGISTRAR_ROLE, address!],
    query: { enabled: !!address && mounted },
  });
  const { data: isResolver } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'hasRole',
    args: [RESOLVER_ROLE, address!],
    query: { enabled: !!address && mounted },
  });

  // ── All Lands paginated ───────────────────────────────────────────────────
  const [cursor, setCursor] = useState(BigInt(0));
  const PAGE_SIZE = BigInt(10);

  const { data: landPage, isLoading: isLandsLoading, refetch: refetchLands } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'getAllLandRecordsPaginated',
    args: [cursor, PAGE_SIZE],
    query: { enabled: mounted },
  });
  const landRecords =
    (
      landPage as
        | [
            { landId: string; ipfsHash: string; landType: number; status: number; proposedAt: bigint; verifiedAt: bigint }[],
            bigint,
          ]
        | undefined
    )?.[0] ?? [];
  const nextCursor =
    (landPage as [unknown[], bigint] | undefined)?.[1] ?? BigInt(0);

  // ── Import land (POST /api/verify) ────────────────────────────────────────
  const [importLandId, setImportLandId] = useState('');
  const [importIpfsHash, setImportIpfsHash] = useState('');
  const [importLandType, setImportLandType] = useState('0');
  const [importCourtCid, setImportCourtCid] = useState('');
  const [importOwners, setImportOwners] = useState<OwnerEntry[]>([{ address: '', shareBps: '' }]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

  const addImportOwner = () => setImportOwners((o) => [...o, { address: '', shareBps: '' }]);
  const removeImportOwner = (i: number) =>
    setImportOwners((o) => o.filter((_, idx) => idx !== i));
  const updateImportOwner = (i: number, field: keyof OwnerEntry, val: string) =>
    setImportOwners((o) => o.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = ownerTotal(importOwners);
    if (total !== 10000) {
      setImportResult(`Owner shares must sum to 10000 bps. Current total: ${total}`);
      return;
    }
    setIsImporting(true);
    setImportResult('');
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landId: importLandId,
          ipfsHash: importIpfsHash,
          landType: parseInt(importLandType),
          courtOrderCid: importCourtCid,
          owners: importOwners.map((o) => ({
            address: o.address,
            shareBps: parseInt(o.shareBps) || 0,
          })),
        }),
      });
      const data = await res.json();
      if (data.txHash) {
        setTxToast({ hash: data.txHash, message: 'Land import proposed!' });
        setImportResult(`Success! Tx: ${data.txHash}`);
        refetchLands();
      } else {
        setImportResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setImportResult(`Network error: ${(err as Error).message}`);
    }
    setIsImporting(false);
  };

  // ── Initiate Inheritance (POST /api/inheritance) ───────────────────────
  const [inhLandId, setInhLandId] = useState('');
  const [inhDeceased, setInhDeceased] = useState('');
  const [inhCourtCid, setInhCourtCid] = useState('');
  const [inhAppealId, setInhAppealId] = useState('0');
  const [inhHeirs, setInhHeirs] = useState<HeirEntry[]>([{ address: '', shareBps: '' }]);
  const [isInitiating, setIsInitiating] = useState(false);
  const [inhResult, setInhResult] = useState('');
  const [deceasedBalance, setDeceasedBalance] = useState<string | null>(null);

  const fetchDeceasedBalance = async () => {
    if (!inhLandId.trim() || !inhDeceased.trim() || !publicClient) return;
    try {
      const bps = await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getShareBps',
        args: [inhLandId.trim(), inhDeceased.trim() as `0x${string}`],
      }) as number;
      setDeceasedBalance(`${bps} bps (${(bps / 100).toFixed(2)}%)`);
    } catch {
      setDeceasedBalance('Could not fetch — check Land ID and address');
    }
  };

  const addHeir = () => setInhHeirs((h) => [...h, { address: '', shareBps: '' }]);
  const removeHeir = (i: number) => setInhHeirs((h) => h.filter((_, idx) => idx !== i));
  const updateHeir = (i: number, field: keyof HeirEntry, val: string) =>
    setInhHeirs((h) => h.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));

  const handleInheritance = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInitiating(true);
    setInhResult('');
    try {
      const res = await fetch('/api/inheritance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landId: inhLandId,
          deceasedHolder: inhDeceased,
          courtOrderCid: inhCourtCid,
          appealId: parseInt(inhAppealId) || 0,
          heirs: inhHeirs.map((h) => ({ address: h.address, shareBps: parseInt(h.shareBps) || 0 })),
        }),
      });
      const data = await res.json();
      if (data.txHash) {
        setTxToast({ hash: data.txHash, message: 'Inheritance initiated!' });
        setInhResult(`Success! Tx: ${data.txHash}`);
      } else {
        setInhResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setInhResult(`Network error: ${(err as Error).message}`);
    }
    setIsInitiating(false);
  };

  // ── Resolve Dispute (POST /api/dispute) ────────────────────────────────
  const [dispLandId, setDispLandId] = useState('');
  const [dispType, setDispType] = useState<'inheritance' | 'import'>('inheritance');
  const [dispForce, setDispForce] = useState(false);
  const [dispCourtCid, setDispCourtCid] = useState('');
  const [dispResCid, setDispResCid] = useState('');
  const [dispReason, setDispReason] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [dispResult, setDispResult] = useState('');

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResolving(true);
    setDispResult('');
    try {
      const res = await fetch('/api/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landId: dispLandId,
          disputeType: dispType,
          forceExecute: dispForce,
          updatedCourtOrderCid: dispCourtCid,
          legalResolutionCid: dispResCid,
          overrideReason: dispReason,
        }),
      });
      const data = await res.json();
      if (data.txHash) {
        setTxToast({ hash: data.txHash, message: 'Dispute resolved!' });
        setDispResult(`Success! Tx: ${data.txHash}`);
      } else {
        setDispResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setDispResult(`Network error: ${(err as Error).message}`);
    }
    setIsResolving(false);
  };

  // ── Propose Subdivision (POST /api/subdivision) ─────────────────────────
  const [subdivParent, setSubdivParent] = useState('');
  const [subdivCourtCid, setSubdivCourtCid] = useState('');
  const [subdivSurveyCid, setSubdivSurveyCid] = useState('');
  const [children, setChildren] = useState<ChildEntry[]>([
    { landId: '', ipfsHash: '', owners: [{ address: '', shareBps: '' }] },
  ]);
  const [isSubdividing, setIsSubdividing] = useState(false);
  const [subdivResult, setSubdivResult] = useState('');

  const addChild = () =>
    setChildren((c) => [
      ...c,
      { landId: '', ipfsHash: '', owners: [{ address: '', shareBps: '' }] },
    ]);
  const removeChild = (i: number) => setChildren((c) => c.filter((_, idx) => idx !== i));
  const updateChildField = (ci: number, field: 'landId' | 'ipfsHash', val: string) =>
    setChildren((c) => c.map((e, idx) => (idx === ci ? { ...e, [field]: val } : e)));
  const addChildOwner = (ci: number) =>
    setChildren((c) =>
      c.map((e, idx) =>
        idx === ci ? { ...e, owners: [...e.owners, { address: '', shareBps: '' }] } : e
      )
    );
  const removeChildOwner = (ci: number, oi: number) =>
    setChildren((c) =>
      c.map((e, idx) =>
        idx === ci ? { ...e, owners: e.owners.filter((_, oIdx) => oIdx !== oi) } : e
      )
    );
  const updateChildOwner = (ci: number, oi: number, field: keyof OwnerEntry, val: string) =>
    setChildren((c) =>
      c.map((e, idx) =>
        idx === ci
          ? {
              ...e,
              owners: e.owners.map((o, oIdx) => (oIdx === oi ? { ...o, [field]: val } : o)),
            }
          : e
      )
    );

  const handleSubdivision = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const child of children) {
      const total = ownerTotal(child.owners);
      if (total !== 10000) {
        setSubdivResult(`Child "${child.landId}" shares sum to ${total}, must be 10000.`);
        return;
      }
    }
    setIsSubdividing(true);
    setSubdivResult('');
    try {
      const res = await fetch('/api/subdivision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentLandId: subdivParent,
          courtOrderCid: subdivCourtCid,
          surveyMetadataCid: subdivSurveyCid,
          children: children.map((c) => ({
            landId: c.landId,
            ipfsHash: c.ipfsHash,
            owners: c.owners.map((o) => ({
              address: o.address,
              shareBps: parseInt(o.shareBps) || 0,
            })),
          })),
        }),
      });
      const data = await res.json();
      if (data.txHash) {
        setTxToast({ hash: data.txHash, message: 'Subdivision proposed!' });
        setSubdivResult(`Success! Tx: ${data.txHash}`);
      } else {
        setSubdivResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setSubdivResult(`Network error: ${(err as Error).message}`);
    }
    setIsSubdividing(false);
  };

  // ── Role Management ───────────────────────────────────────────────────────
  const grantRoleRef = useRef(false);
  const revokeRoleRef = useRef(false);

  const [roleTarget, setRoleTarget] = useState('');
  const [roleToManage, setRoleToManage] = useState(REGISTRAR_ROLE);

  const { writeContract: writeGrantRole, data: grantRoleHash, isPending: isGrantPending } = useWriteContract();
  const { isSuccess: isGrantSuccess } = useWaitForTransactionReceipt({ hash: grantRoleHash });

  const { writeContract: writeRevokeRole, data: revokeRoleHash, isPending: isRevokePending } = useWriteContract();
  const { isSuccess: isRevokeSuccess } = useWaitForTransactionReceipt({ hash: revokeRoleHash });

  useEffect(() => {
    if (isGrantSuccess && grantRoleHash && !grantRoleRef.current) {
      grantRoleRef.current = true;
      setTxToast({ hash: grantRoleHash, message: 'Role granted!' });
    }
  }, [isGrantSuccess, grantRoleHash]);

  useEffect(() => {
    if (isRevokeSuccess && revokeRoleHash && !revokeRoleRef.current) {
      revokeRoleRef.current = true;
      setTxToast({ hash: revokeRoleHash, message: 'Role revoked.' });
    }
  }, [isRevokeSuccess, revokeRoleHash]);

  if (!mounted) return null;

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        tab === id ? 'bg-accent text-white' : 'text-muted hover:text-foreground hover:bg-surface'
      }`}
    >
      {label}
    </button>
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Navbar />

      {txToast && (
        <TxToast txHash={txToast.hash} message={txToast.message} onDismiss={() => setTxToast(null)} />
      )}

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap gap-3 items-end justify-between mb-2">
          <div>
            <span className="text-xs font-mono text-muted tracking-[0.2em] uppercase">Transfer Office</span>
            <h1 className="font-sans font-semibold text-3xl text-foreground tracking-tight mt-2">Admin Dashboard</h1>
            <p className="text-muted text-xs font-mono mt-1">{address}</p>
          </div>
          <div className="flex gap-2 flex-wrap mb-1">
            {isAdmin && <span className="pill border bg-purple-500/10 text-purple-400 border-purple-500/20">ADMIN</span>}
            {isRegistrar && <span className="pill border bg-blue-500/10 text-blue-400 border-blue-500/20">REGISTRAR</span>}
            {isResolver && <span className="pill border bg-orange-500/10 text-orange-400 border-orange-500/20">RESOLVER</span>}
          </div>
        </div>

        {notice && (
          <div
            className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${
              notice.tone === 'error'
                ? 'bg-red-500/10 border-red-500/20 text-red-300'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
            }`}
          >
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)} className="ml-auto text-muted hover:text-foreground">×</button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {tabBtn('import', 'Import Land')}
          {tabBtn('lands', 'All Lands')}
          {tabBtn('inheritance', 'Initiate Inheritance')}
          {tabBtn('dispute', 'Resolve Disputes')}
          {tabBtn('subdivision', 'Propose Subdivision')}
          {tabBtn('roles', 'Role Management')}
        </div>

        {/* ── Import Land ─────────────────────────────────────────────────── */}
        {tab === 'import' && (
          <div className="glass-card p-6 rounded-2xl space-y-5">
            <h2 className="font-semibold">Propose Land Import (REGISTRAR)</h2>
            <form onSubmit={handleImport} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Land ID</label>
                  <input type="text" value={importLandId} onChange={(e) => setImportLandId(e.target.value)} className="field w-full mt-1" placeholder="DHA-P9-042" required />
                </div>
                <div>
                  <label className="text-xs text-muted">Land Type</label>
                  <select value={importLandType} onChange={(e) => setImportLandType(e.target.value)} className="field w-full mt-1">
                    <option value="0">Residential</option>
                    <option value="1">Agricultural</option>
                    <option value="2">Commercial</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted">IPFS Hash (metadata CID)</label>
                <input type="text" value={importIpfsHash} onChange={(e) => setImportIpfsHash(e.target.value)} className="field w-full mt-1" placeholder="bafyrei…" required />
              </div>
              <div>
                <label className="text-xs text-muted">Court Order CID (optional)</label>
                <input type="text" value={importCourtCid} onChange={(e) => setImportCourtCid(e.target.value)} className="field w-full mt-1" placeholder="bafyrei…" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted">Proposed Owners (must sum to 10,000 bps)</label>
                  <button type="button" onClick={addImportOwner} className="text-xs text-accent flex items-center gap-1 hover:text-accent">
                    <Plus size={12} /> Add owner
                  </button>
                </div>
                <div className="space-y-2">
                  {importOwners.map((o, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input type="text" value={o.address} onChange={(e) => updateImportOwner(i, 'address', e.target.value)} className="field flex-1 font-mono text-xs" placeholder="0x…" required />
                      <input type="number" value={o.shareBps} onChange={(e) => updateImportOwner(i, 'shareBps', e.target.value)} className="field w-24 font-mono text-xs" placeholder="bps" required />
                      {importOwners.length > 1 && (
                        <button type="button" onClick={() => removeImportOwner(i)} className="text-red-400 hover:text-red-300">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className={`text-xs mt-1 ${ownerTotal(importOwners) === 10000 ? 'text-green-400' : 'text-orange-400'}`}>
                  Total: {ownerTotal(importOwners)} / 10,000 bps
                </p>
              </div>

              {importResult && (
                <div className={`text-xs p-3 rounded-lg border ${importResult.startsWith('Error') || importResult.startsWith('Network') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                  {importResult}
                </div>
              )}

              <button type="submit" disabled={isImporting} className="btn-primary w-full flex items-center justify-center gap-2">
                {isImporting && <Loader2 size={14} className="animate-spin" />}
                Propose Import
              </button>
            </form>
          </div>
        )}

        {/* ── All Lands ──────────────────────────────────────────────────── */}
        {tab === 'lands' && (
          <div className="space-y-3">
            {isLandsLoading ? (
              <div className="flex items-center gap-2 text-muted">
                <Loader2 size={16} className="animate-spin" /> Loading…
              </div>
            ) : landRecords.length === 0 ? (
              <div className="surface p-8 rounded-2xl text-center text-muted">No lands found.</div>
            ) : (
              landRecords.map((land) => (
                <div key={land.landId} className="surface p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-accent">{land.landId}</p>
                    <p className="text-xs text-muted">{landTypeLabel(land.landType as LandTypeV9)}</p>
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    <span className={`pill border text-xs ${STATUS_TONE[land.status] ?? ''}`}>
                      {landStatusLabel(land.status as LandStatusV9)}
                    </span>
                    {land.ipfsHash && (
                      <a href={`https://gateway.pinata.cloud/ipfs/${land.ipfsHash}`} target="_blank" rel="noopener noreferrer" className="text-muted/60 hover:text-accent">
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}

            <div className="flex gap-2 pt-2">
              <button onClick={() => setCursor((c) => (c > PAGE_SIZE ? c - PAGE_SIZE : BigInt(0)))} disabled={cursor === BigInt(0)} className="btn-ghost px-3 disabled:opacity-30">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => { if (nextCursor > BigInt(0)) setCursor(nextCursor); }} disabled={nextCursor === BigInt(0)} className="btn-ghost px-3 disabled:opacity-30">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Initiate Inheritance ────────────────────────────────────────── */}
        {tab === 'inheritance' && (
          <div className="glass-card p-6 rounded-2xl space-y-5">
            <h2 className="font-semibold">Initiate Inheritance (REGISTRAR)</h2>
            <form onSubmit={handleInheritance} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Land ID</label>
                  <input type="text" value={inhLandId} onChange={(e) => setInhLandId(e.target.value)} className="field w-full mt-1" required />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted">Deceased Holder Address</label>
                    <button type="button" onClick={fetchDeceasedBalance} className="text-xs text-accent hover:text-accent">
                      Fetch share →
                    </button>
                  </div>
                  <input type="text" value={inhDeceased} onChange={(e) => { setInhDeceased(e.target.value); setDeceasedBalance(null); }} className="field w-full mt-1 font-mono text-xs" placeholder="0x…" required />
                  {deceasedBalance && (
                    <p className="text-xs mt-1 text-accent">Share: <span className="font-mono">{deceasedBalance}</span> — heirs must sum to this</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Court Order CID <span className="text-red-400">*</span></label>
                  <input type="text" value={inhCourtCid} onChange={(e) => setInhCourtCid(e.target.value)} className="field w-full mt-1" placeholder="IPFS CID or 'N/A' for testing" required />
                </div>
                <div>
                  <label className="text-xs text-muted">Appeal ID (0 if none)</label>
                  <input type="number" value={inhAppealId} onChange={(e) => setInhAppealId(e.target.value)} className="field w-full mt-1" min="0" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted">Heirs (bps must equal deceased&apos;s share)</label>
                  <button type="button" onClick={addHeir} className="text-xs text-accent flex items-center gap-1 hover:text-accent">
                    <Plus size={12} /> Add heir
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_96px_24px] gap-2 mb-1 px-1">
                  <span className="text-xs text-muted/60">Wallet address (0x…)</span>
                  <span className="text-xs text-muted/60">Share (bps)</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {inhHeirs.map((h, i) => (
                    <div key={i} className="grid grid-cols-[1fr_96px_24px] gap-2 items-center">
                      <input type="text" value={h.address} onChange={(e) => updateHeir(i, 'address', e.target.value)} className="field font-mono text-xs" placeholder="0x…" required />
                      <input type="number" value={h.shareBps} onChange={(e) => updateHeir(i, 'shareBps', e.target.value)} className="field font-mono text-xs" placeholder="bps" required />
                      {inhHeirs.length > 1 ? (
                        <button type="button" onClick={() => removeHeir(i)} className="text-red-400 hover:text-red-300">
                          <Trash2 size={14} />
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
                <p className="text-xs mt-1 text-muted">
                  Total heir shares: {inhHeirs.reduce((s, h) => s + (parseInt(h.shareBps) || 0), 0)} bps
                </p>
              </div>

              {inhResult && (
                <div className={`text-xs p-3 rounded-lg border ${inhResult.startsWith('Error') || inhResult.startsWith('Network') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                  {inhResult}
                </div>
              )}

              <button type="submit" disabled={isInitiating} className="btn-primary w-full flex items-center justify-center gap-2">
                {isInitiating && <Loader2 size={14} className="animate-spin" />}
                Initiate Inheritance
              </button>
            </form>
          </div>
        )}

        {/* ── Resolve Disputes ────────────────────────────────────────────── */}
        {tab === 'dispute' && (
          <div className="glass-card p-6 rounded-2xl space-y-5">
            <h2 className="font-semibold">Resolve Dispute (RESOLVER)</h2>
            <form onSubmit={handleResolve} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Land ID</label>
                  <input type="text" value={dispLandId} onChange={(e) => setDispLandId(e.target.value)} className="field w-full mt-1" required />
                </div>
                <div>
                  <label className="text-xs text-muted">Dispute type</label>
                  <select value={dispType} onChange={(e) => setDispType(e.target.value as 'inheritance' | 'import')} className="field w-full mt-1">
                    <option value="inheritance">Inheritance dispute</option>
                    <option value="import">Import dispute</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted">Updated Court Order CID</label>
                <input type="text" value={dispCourtCid} onChange={(e) => setDispCourtCid(e.target.value)} className="field w-full mt-1" />
              </div>
              {dispType === 'inheritance' && (
                <>
                  <div>
                    <label className="text-xs text-muted">Legal Resolution CID</label>
                    <input type="text" value={dispResCid} onChange={(e) => setDispResCid(e.target.value)} className="field w-full mt-1" />
                  </div>
                  <div>
                    <label className="text-xs text-muted">Override reason</label>
                    <input type="text" value={dispReason} onChange={(e) => setDispReason(e.target.value)} className="field w-full mt-1" />
                  </div>
                </>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={dispForce} onChange={(e) => setDispForce(e.target.checked)} className="rounded" />
                Force execute (override dispute, apply original plan)
              </label>

              {dispResult && (
                <div className={`text-xs p-3 rounded-lg border ${dispResult.startsWith('Error') || dispResult.startsWith('Network') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                  {dispResult}
                </div>
              )}

              <button type="submit" disabled={isResolving} className="btn-primary w-full flex items-center justify-center gap-2">
                {isResolving && <Loader2 size={14} className="animate-spin" />}
                Resolve Dispute
              </button>
            </form>
          </div>
        )}

        {/* ── Propose Subdivision ──────────────────────────────────────────── */}
        {tab === 'subdivision' && (
          <div className="glass-card p-6 rounded-2xl space-y-5">
            <h2 className="font-semibold">Propose Subdivision (REGISTRAR)</h2>
            <form onSubmit={handleSubdivision} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted">Parent Land ID</label>
                  <input type="text" value={subdivParent} onChange={(e) => setSubdivParent(e.target.value)} className="field w-full mt-1" required />
                </div>
                <div>
                  <label className="text-xs text-muted">Court Order CID</label>
                  <input type="text" value={subdivCourtCid} onChange={(e) => setSubdivCourtCid(e.target.value)} className="field w-full mt-1" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted">Survey Metadata CID</label>
                <input type="text" value={subdivSurveyCid} onChange={(e) => setSubdivSurveyCid(e.target.value)} className="field w-full mt-1" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-muted">Child parcels</label>
                  <button type="button" onClick={addChild} className="text-xs text-accent flex items-center gap-1 hover:text-accent">
                    <Plus size={12} /> Add child
                  </button>
                </div>
                {children.map((child, ci) => (
                  <div key={ci} className="surface p-4 rounded-xl space-y-3 mb-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted">Child {ci + 1}</p>
                      {children.length > 1 && (
                        <button type="button" onClick={() => removeChild(ci)} className="text-red-400">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input type="text" value={child.landId} onChange={(e) => updateChildField(ci, 'landId', e.target.value)} className="field text-xs" placeholder="Child land ID" required />
                      <input type="text" value={child.ipfsHash} onChange={(e) => updateChildField(ci, 'ipfsHash', e.target.value)} className="field text-xs" placeholder="IPFS hash" required />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted">Owners (sum to 10,000)</p>
                        <button type="button" onClick={() => addChildOwner(ci)} className="text-xs text-accent flex items-center gap-1">
                          <Plus size={11} /> Owner
                        </button>
                      </div>
                      {child.owners.map((o, oi) => (
                        <div key={oi} className="flex gap-2 items-center mb-1">
                          <input type="text" value={o.address} onChange={(e) => updateChildOwner(ci, oi, 'address', e.target.value)} className="field flex-1 font-mono text-xs" placeholder="0x…" required />
                          <input type="number" value={o.shareBps} onChange={(e) => updateChildOwner(ci, oi, 'shareBps', e.target.value)} className="field w-20 font-mono text-xs" placeholder="bps" required />
                          {child.owners.length > 1 && (
                            <button type="button" onClick={() => removeChildOwner(ci, oi)} className="text-red-400">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      <p className={`text-xs ${ownerTotal(child.owners) === 10000 ? 'text-green-400' : 'text-orange-400'}`}>
                        Total: {ownerTotal(child.owners)} / 10,000
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {subdivResult && (
                <div className={`text-xs p-3 rounded-lg border ${subdivResult.startsWith('Error') || subdivResult.startsWith('Network') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'}`}>
                  {subdivResult}
                </div>
              )}

              <button type="submit" disabled={isSubdividing} className="btn-primary w-full flex items-center justify-center gap-2">
                {isSubdividing && <Loader2 size={14} className="animate-spin" />}
                Propose Subdivision
              </button>
            </form>
          </div>
        )}

        {/* ── Role Management ─────────────────────────────────────────────── */}
        {tab === 'roles' && (
          <div className="glass-card p-6 rounded-2xl space-y-5">
            <h2 className="font-semibold">Role Management (ADMIN only)</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted">Role</label>
                <select value={roleToManage} onChange={(e) => setRoleToManage(e.target.value as `0x${string}`)} className="field w-full mt-1">
                  <option value={REGISTRAR_ROLE}>REGISTRAR_ROLE</option>
                  <option value={RESOLVER_ROLE}>RESOLVER_ROLE</option>
                  <option value={PAUSER_ROLE}>PAUSER_ROLE</option>
                  <option value={ADMIN_ROLE}>ADMIN_ROLE (DEFAULT)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted">Target address</label>
                <input type="text" value={roleTarget} onChange={(e) => setRoleTarget(e.target.value)} className="field w-full mt-1 font-mono text-xs" placeholder="0x…" />
              </div>
              <div className="flex gap-3">
                <button
                  disabled={!roleTarget || isGrantPending}
                  onClick={() => {
                    grantRoleRef.current = false;
                    writeGrantRole({
                      address: CONTRACT_V9_ADDRESS,
                      abi: CONTRACT_V9_ABI,
                      functionName: 'grantRole',
                      args: [roleToManage, roleTarget as `0x${string}`],
                    });
                  }}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {isGrantPending && <Loader2 size={14} className="animate-spin" />}
                  Grant Role
                </button>
                <button
                  disabled={!roleTarget || isRevokePending}
                  onClick={() => {
                    if (!confirm(`Revoke role from ${roleTarget}? This cannot be undone without re-granting.`)) return;
                    revokeRoleRef.current = false;
                    writeRevokeRole({
                      address: CONTRACT_V9_ADDRESS,
                      abi: CONTRACT_V9_ABI,
                      functionName: 'revokeRole',
                      args: [roleToManage, roleTarget as `0x${string}`],
                    });
                  }}
                  className="btn-ghost flex-1 text-red-400 flex items-center justify-center gap-2"
                >
                  {isRevokePending && <Loader2 size={14} className="animate-spin" />}
                  Revoke Role
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AdminDashboard() {
  return (
    <AdminGuard>
      <AdminDashboardInner />
    </AdminGuard>
  );
}
