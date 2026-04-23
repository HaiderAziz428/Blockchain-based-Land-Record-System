'use client';

import { useState } from 'react';
import AdminGuard from '@/src/components/guards/AdminGuard';
import Navbar from '@/src/components/Navbar';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { Loader2, Plus, Trash2 } from 'lucide-react';

const LAND_TYPE_LABEL = ['Residential', 'Agricultural', 'Commercial'];
const LAND_STATUS_LABEL = ['Active', 'Pending Inheritance', 'Dispute Locked'];

interface HeirEntry { address: string; newLandId: string; newIpfsHash: string; }

export default function AdminDashboard() {
  const { address } = useAccount();

  // ── Contract info ────────────────────────────────────────────────────────
  const { data: contractOwner, isLoading: isOwnerLoading } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'owner',
  });

  // ── All Land Records (first page) ────────────────────────────────────────
  const [recordCursor, setRecordCursor] = useState(BigInt(0));
  const { data: landPage, isLoading: isLandsLoading, refetch: refetchLands } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getAllLandRecordsPaginated',
    args: [recordCursor, BigInt(10)],
  });
  const landRecords = (landPage as [{ currentOwner: string; cnic: string; landId: string; ipfsHash: string; landType: number; status: number; verifiedAt: bigint }[], bigint] | undefined)?.[0] ?? [];
  const nextCursor = (landPage as [unknown[], bigint] | undefined)?.[1] ?? BigInt(0);

  // ── Initiate Inheritance ─────────────────────────────────────────────────
  const [oldLandId, setOldLandId] = useState('');
  const [heirs, setHeirs] = useState<HeirEntry[]>([{ address: '', newLandId: '', newIpfsHash: '' }]);
  const [isInitiating, setIsInitiating] = useState(false);
  const [initiateResult, setInitiateResult] = useState('');

  const addHeir = () => setHeirs(h => [...h, { address: '', newLandId: '', newIpfsHash: '' }]);
  const removeHeir = (i: number) => setHeirs(h => h.filter((_, idx) => idx !== i));
  const updateHeir = (i: number, field: keyof HeirEntry, val: string) =>
    setHeirs(h => h.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const handleInitiateInheritance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldLandId || heirs.some(h => !h.address || !h.newLandId)) {
      setInitiateResult('Fill all fields before submitting.');
      return;
    }
    setIsInitiating(true);
    setInitiateResult('');
    try {
      const res = await fetch('/api/inheritance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldLandId,
          heirs: heirs.map(h => h.address),
          newLandIds: heirs.map(h => h.newLandId),
          newIpfsHashes: heirs.map(h => h.newIpfsHash || `verified_${h.newLandId}`),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInitiateResult(`Inheritance initiated. Tx: ${data.txHash}`);
      setOldLandId('');
      setHeirs([{ address: '', newLandId: '', newIpfsHash: '' }]);
      void refetchLands();
    } catch (e: unknown) {
      setInitiateResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
    setIsInitiating(false);
  };

  // ── Resolve Dispute ──────────────────────────────────────────────────────
  const [disputeLandId, setDisputeLandId] = useState('');
  const [forceExecute, setForceExecute] = useState(false);
  const [isResolving, setIsResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState('');

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeLandId) return;
    setIsResolving(true);
    setResolveResult('');
    try {
      const res = await fetch('/api/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldLandId: disputeLandId, forceExecute }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResolveResult(`Dispute resolved. Tx: ${data.txHash}`);
      setDisputeLandId('');
      void refetchLands();
    } catch (e: unknown) {
      setResolveResult(`Error: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
    setIsResolving(false);
  };

  // ── Set Govt Authority ───────────────────────────────────────────────────
  const [govtWallet, setGovtWallet] = useState('');
  const [govtStatus, setGovtStatus] = useState(true);
  const { writeContract: setAuthorityWrite, data: authTxHash, isPending: isAuthPending } = useWriteContract();
  const { isLoading: isAuthConfirming, isSuccess: isAuthSuccess } = useWaitForTransactionReceipt({ hash: authTxHash });

  const handleSetGovtAuthority = (e: React.FormEvent) => {
    e.preventDefault();
    if (!govtWallet) return;
    setAuthorityWrite({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'setGovtAuthority',
      args: [govtWallet as `0x${string}`, govtStatus],
    });
  };

  return (
    <AdminGuard>
      <div className="min-h-screen bg-brand-dark text-white">
        <Navbar />

        <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10 space-y-14">

          {/* ── Info Cards ───────────────────────────────────────────── */}
          <div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">Admin Portal</h1>
            <p className="text-sm text-white/60 mb-8">Access is restricted to the smart contract owner.</p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="text-xs text-gray-500 font-medium tracking-wide uppercase">Contract</div>
                <div className="mt-2 text-sm text-gray-200">Land Registry (PLR)</div>
                <div className="mt-3 break-all font-mono text-[11px] text-gray-400">{CONTRACT_ADDRESS}</div>
              </div>
              <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="text-xs text-gray-500 font-medium tracking-wide uppercase">Owner (on-chain)</div>
                <div className="mt-2 text-sm text-gray-200">{isOwnerLoading ? 'Loading…' : 'Verified'}</div>
                <div className="mt-3 break-all font-mono text-[11px] text-gray-400">{String(contractOwner || '')}</div>
              </div>
              <div className="p-6 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                <div className="text-xs text-gray-500 font-medium tracking-wide uppercase">Connected Wallet</div>
                <div className="mt-2 text-sm text-gray-200">Session</div>
                <div className="mt-3 break-all font-mono text-[11px] text-gray-400">{address || 'Not connected'}</div>
              </div>
            </div>

            {/* Verify API info */}
            <div className="mt-6 p-5 rounded-xl border border-white/10 bg-white/5">
              <div className="text-xs font-mono text-gray-300">POST <span className="text-indigo-300">/api/verify</span></div>
              <div className="mt-1 text-xs font-mono text-white/50">body: {'{ userAddress, landId }'} — mints verified land via backend key</div>
            </div>
          </div>

          {/* ── All Land Records ─────────────────────────────────────── */}
          <div>
            <h2 className="text-xl font-semibold mb-4 tracking-tight">All Land Records</h2>
            {isLandsLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading records…</div>
            ) : landRecords.length === 0 ? (
              <div className="text-gray-500 text-sm p-6 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">No land records found on-chain.</div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white/[0.04] text-gray-400 uppercase tracking-wide">
                      <tr>
                        {['Land ID', 'Owner', 'CNIC', 'Type', 'Status', 'Verified'].map(h => (
                          <th key={h} className="px-4 py-3 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {landRecords.map((r) => (
                        <tr key={r.landId} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-mono text-gray-200">{r.landId}</td>
                          <td className="px-4 py-3 font-mono text-gray-400 max-w-[120px] truncate">{r.currentOwner}</td>
                          <td className="px-4 py-3 text-gray-400">{r.cnic}</td>
                          <td className="px-4 py-3 text-gray-300">{LAND_TYPE_LABEL[Number(r.landType)] ?? r.landType}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                              Number(r.status) === 0 ? 'bg-green-500/15 text-green-400' :
                              Number(r.status) === 1 ? 'bg-yellow-500/15 text-yellow-400' :
                                                        'bg-red-500/15 text-red-400'
                            }`}>
                              {LAND_STATUS_LABEL[Number(r.status)] ?? r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {new Date(Number(r.verifiedAt) * 1000).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-3 mt-3">
                  <button
                    onClick={() => setRecordCursor(c => c > BigInt(10) ? c - BigInt(10) : BigInt(0))}
                    disabled={recordCursor === BigInt(0)}
                    className="text-xs px-4 py-2 rounded-lg border border-white/10 disabled:opacity-40 hover:bg-white/5"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => { setRecordCursor(nextCursor); void refetchLands(); }}
                    disabled={landRecords.length < 10}
                    className="text-xs px-4 py-2 rounded-lg border border-white/10 disabled:opacity-40 hover:bg-white/5"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Initiate Inheritance ─────────────────────────────────── */}
          <div>
            <h2 className="text-xl font-semibold mb-1 tracking-tight">Initiate Succession Plan</h2>
            <p className="text-gray-500 text-sm mb-6">
              Burns the deceased owner&apos;s NFT and mints new land deeds for each heir. Heirs must all approve before execution.
              Sent via the backend signing key (verificationBackend wallet).
            </p>
            <form onSubmit={handleInitiateInheritance} className="space-y-5 max-w-2xl">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Original Land ID (being inherited)</label>
                <input
                  value={oldLandId}
                  onChange={e => setOldLandId(e.target.value)}
                  placeholder="e.g. LND-001"
                  className="w-full bg-black/30 border border-white/10 px-4 py-2.5 rounded-lg text-white text-sm font-mono outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="space-y-3">
                <div className="text-xs text-white/60">Heirs</div>
                {heirs.map((heir, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                    <input value={heir.address} onChange={e => updateHeir(i, 'address', e.target.value)}
                      placeholder="Heir wallet 0x..." className="bg-black/30 border border-white/10 px-3 py-2 rounded-lg text-white text-xs font-mono outline-none focus:border-indigo-500" required />
                    <input value={heir.newLandId} onChange={e => updateHeir(i, 'newLandId', e.target.value)}
                      placeholder="New Land ID" className="bg-black/30 border border-white/10 px-3 py-2 rounded-lg text-white text-xs font-mono outline-none focus:border-indigo-500" required />
                    <input value={heir.newIpfsHash} onChange={e => updateHeir(i, 'newIpfsHash', e.target.value)}
                      placeholder="IPFS hash (optional)" className="bg-black/30 border border-white/10 px-3 py-2 rounded-lg text-white text-xs font-mono outline-none focus:border-indigo-500" />
                    {heirs.length > 1 && (
                      <button type="button" onClick={() => removeHeir(i)} className="text-red-400 hover:text-red-300 p-1">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addHeir} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                  <Plus size={12} /> Add Heir
                </button>
              </div>

              <button
                type="submit"
                disabled={isInitiating}
                className="bg-yellow-600 hover:bg-yellow-500 px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isInitiating && <Loader2 size={14} className="animate-spin" />}
                Initiate Inheritance
              </button>

              {initiateResult && (
                <p className={`text-xs mt-2 ${initiateResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {initiateResult}
                </p>
              )}
            </form>
          </div>

          {/* ── Resolve Dispute ──────────────────────────────────────── */}
          <div>
            <h2 className="text-xl font-semibold mb-1 tracking-tight">Resolve Dispute</h2>
            <p className="text-gray-500 text-sm mb-6">
              Force-execute a succession plan or reset the land to Active status. Uses the backend signing key.
            </p>
            <form onSubmit={handleResolveDispute} className="space-y-4 max-w-xl">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Disputed Land ID</label>
                <input
                  value={disputeLandId}
                  onChange={e => setDisputeLandId(e.target.value)}
                  placeholder="e.g. LND-001"
                  className="w-full bg-black/30 border border-white/10 px-4 py-2.5 rounded-lg text-white text-sm font-mono outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceExecute}
                  onChange={e => setForceExecute(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500"
                />
                <span className="text-sm text-gray-300">Force-execute the inheritance plan (cannot be undone)</span>
              </label>
              <button
                type="submit"
                disabled={isResolving}
                className="bg-red-700 hover:bg-red-600 px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isResolving && <Loader2 size={14} className="animate-spin" />}
                {forceExecute ? 'Force Execute' : 'Reset to Active'}
              </button>
              {resolveResult && (
                <p className={`text-xs mt-2 ${resolveResult.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {resolveResult}
                </p>
              )}
            </form>
          </div>

          {/* ── Set Govt Authority ───────────────────────────────────── */}
          <div>
            <h2 className="text-xl font-semibold mb-1 tracking-tight">Govt Authority Access</h2>
            <p className="text-gray-500 text-sm mb-6">
              Whitelist a government department wallet (CDA, DHA, LDA) so it can hold land without a personal CNIC.
              Signed directly by your admin wallet.
            </p>
            <form onSubmit={handleSetGovtAuthority} className="space-y-4 max-w-xl">
              <div>
                <label className="text-xs text-white/60 mb-1 block">Govt Wallet Address</label>
                <input
                  value={govtWallet}
                  onChange={e => setGovtWallet(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-black/30 border border-white/10 px-4 py-2.5 rounded-lg text-white text-sm font-mono outline-none focus:border-indigo-500"
                  required
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={govtStatus}
                  onChange={e => setGovtStatus(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500"
                />
                <span className="text-sm text-gray-300">Grant authority (uncheck to revoke)</span>
              </label>
              <button
                type="submit"
                disabled={isAuthPending || isAuthConfirming}
                className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {(isAuthPending || isAuthConfirming) && <Loader2 size={14} className="animate-spin" />}
                {govtStatus ? 'Grant Authority' : 'Revoke Authority'}
              </button>
              {isAuthSuccess && (
                <p className="text-xs text-green-400">Authority updated successfully.</p>
              )}
            </form>
          </div>

        </main>
      </div>
    </AdminGuard>
  );
}
