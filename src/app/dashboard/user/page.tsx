'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { supabase } from '@/src/lib/supabase';
import Navbar from '@/src/components/Navbar';
import TxToast from '@/src/components/TxToast';
import { Loader2, MapPin, CheckCircle, Tag, XCircle, ArrowRightLeft, ShieldCheck, ShieldAlert, Info } from 'lucide-react';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import CreateListingModal from '@/src/components/CreateListingModal';
import TransferModal from '@/src/components/TransferModal';

interface Plot {
  land_id: string;
  owner_cnic: string;
  location: string;
  area_sq_yards: number;
  isMinted?: boolean;
  landStatus?: number;       // 0=ACTIVE 1=PENDING_INHERITANCE 2=LOCKED_DISPUTE
  isListedOnChain?: boolean; // true when landListings[land_id].isActive
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const LAND_STATUS_LABEL: Record<number, string> = {
  0: 'Active',
  1: 'Pending Inheritance',
  2: 'Dispute Locked',
};

export default function UserDashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [userData, setUserData] = useState<{ full_name: string; cnic: string } | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [mintingPlotId, setMintingPlotId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const cancelProcessedRef = useRef(false);

  const [isListingModalOpen, setListingModalOpen] = useState(false);
  const [isTransferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedLand, setSelectedLand] = useState<Plot | null>(null);

  const [txToast, setTxToast] = useState<{ hash: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);

  // Inheritance heir state
  const [heirLandId, setHeirLandId] = useState('');
  const [heirPlan, setHeirPlan] = useState<{ status: number; approvalCount: bigint; isExecuted: boolean } | null>(null);
  const [isCheckingPlan, setIsCheckingPlan] = useState(false);
  const [heirCheckError, setHeirCheckError] = useState('');
  const approveProcessedRef = useRef(false);
  const disputeProcessedRef = useRef(false);

  const { data: userProfile, isLoading: isContractLoading } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'users',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const loadData = async () => {
    if (!userProfile || !publicClient) return;
    const profile = userProfile as readonly [string, string, boolean];
    const full_name = String(profile[0] ?? '');
    const cnic = String(profile[1] ?? '');
    const isRegistered = Boolean(profile[2]);

    if (!isRegistered || !cnic) { setIsLoading(false); return; }
    setUserData({ full_name, cnic });

    const { data: govtData } = await supabase.from('govt_land_records').select('*').eq('owner_cnic', cnic);

    if (govtData) {
      const mergedPlots = await Promise.all(
        govtData.map(async (plot) => {
          let isMinted = false;
          let landStatus = 0;
          let isListedOnChain = false;
          try {
            const record = await publicClient.readContract({
              address: CONTRACT_ADDRESS as `0x${string}`,
              abi: CONTRACT_ABI,
              functionName: 'getLandRecord',
              args: [plot.land_id],
            }) as { currentOwner: string; status: number };
            isMinted = record.currentOwner !== ZERO_ADDRESS;
            landStatus = Number(record.status);

            if (isMinted) {
              const listing = await publicClient.readContract({
                address: CONTRACT_ADDRESS as `0x${string}`,
                abi: CONTRACT_ABI,
                functionName: 'landListings',
                args: [plot.land_id],
              }) as [bigint, string, boolean, bigint, string];
              isListedOnChain = listing[2];
            }
          } catch { isMinted = false; }

          return { ...plot, isMinted, landStatus, isListedOnChain };
        })
      );
      setPlots(mergedPlots as Plot[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (mounted && userProfile && !isContractLoading) void loadData();
  }, [mounted, userProfile, isContractLoading, publicClient, address]);

  // ── Mint ──────────────────────────────────────────────────────────────────
  const handleMintRequest = async (landId: string) => {
    if (!address) {
      setNotice({ tone: 'error', message: 'Wallet not connected.' });
      return;
    }
    setNotice(null);
    setMintingPlotId(landId);
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address, landId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Verification failed');
      setTxToast({ hash: result.txHash, message: `Plot ${landId} minted successfully!` });
      void loadData();
    } catch (e: unknown) {
      setNotice({ tone: 'error', message: e instanceof Error ? e.message : 'Unknown error' });
    }
    setMintingPlotId(null);
  };

  // ── Cancel Listing ────────────────────────────────────────────────────────
  const { writeContract: cancelWrite, data: cancelTxHash, isPending: isCancelingWallet } = useWriteContract();
  const { isLoading: isCancelingChain, isSuccess: isCancelConfirmed } = useWaitForTransactionReceipt({ hash: cancelTxHash });

  const handleCancelListing = (landId: string) => {
    if (!confirm('Remove this listing from the blockchain?')) return;
    cancelProcessedRef.current = false;
    setCancelingId(landId);
    cancelWrite({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'cancelListing',
      args: [landId],
    });
  };

  useEffect(() => {
    if (!isCancelConfirmed || !cancelingId || cancelProcessedRef.current || !cancelTxHash) return;
    cancelProcessedRef.current = true;
    setTxToast({ hash: cancelTxHash, message: 'Listing cancelled on-chain.' });
    setCancelingId(null);
    void loadData();
  }, [isCancelConfirmed]);

  // ── Inheritance Heir Actions ──────────────────────────────────────────────
  const { writeContract: approveWrite, data: approveTxHash, isPending: isApprovePending } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });

  const { writeContract: disputeWrite, data: disputeTxHash, isPending: isDisputePending } = useWriteContract();
  const { isLoading: isDisputeConfirming, isSuccess: isDisputeSuccess } = useWaitForTransactionReceipt({ hash: disputeTxHash });

  const handleCheckPlan = async () => {
    if (!heirLandId.trim() || !publicClient) return;
    setIsCheckingPlan(true);
    setHeirCheckError('');
    setHeirPlan(null);
    try {
      const [record, plan] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'getLandRecord',
          args: [heirLandId.trim()],
        }) as Promise<{ currentOwner: string; status: number }>,
        publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'inheritanceRequests',
          args: [heirLandId.trim()],
        }) as unknown as Promise<{ approvalCount: bigint; isExecuted: boolean }>,
      ]);

      // Land never existed: owner and status both at default zero values
      if (record.currentOwner === ZERO_ADDRESS && Number(record.status) === 0) {
        setHeirCheckError('No land record found for this ID. Please check and try again.');
        setIsCheckingPlan(false);
        return;
      }
      // currentOwner=0 but status=1 means the land was burned after all heirs approved (executed)
      // Fall through so the UI correctly shows the executed state

      setHeirPlan({ status: Number(record.status), approvalCount: plan.approvalCount, isExecuted: plan.isExecuted });
    } catch {
      setHeirCheckError('Could not read from the blockchain. Check your network connection.');
    }
    setIsCheckingPlan(false);
  };

  const handleApprove = () => {
    approveProcessedRef.current = false;
    approveWrite({ address: CONTRACT_ADDRESS as `0x${string}`, abi: CONTRACT_ABI, functionName: 'approveSuccessionPlan', args: [heirLandId.trim()] });
  };

  const handleDispute = () => {
    disputeProcessedRef.current = false;
    disputeWrite({ address: CONTRACT_ADDRESS as `0x${string}`, abi: CONTRACT_ABI, functionName: 'disputeSuccessionPlan', args: [heirLandId.trim()] });
  };

  useEffect(() => {
    if (isApproveSuccess && !approveProcessedRef.current && approveTxHash) {
      approveProcessedRef.current = true;
      setTxToast({ hash: approveTxHash, message: 'Approval submitted on-chain.' });
      void handleCheckPlan();
    }
  }, [isApproveSuccess]);

  useEffect(() => {
    if (isDisputeSuccess && !disputeProcessedRef.current && disputeTxHash) {
      disputeProcessedRef.current = true;
      setTxToast({ hash: disputeTxHash, message: 'Dispute registered. Land is now locked.' });
      void handleCheckPlan();
    }
  }, [isDisputeSuccess]);

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-brand-dark">
        <Loader2 className="animate-spin text-brand-primary" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <Navbar />
      <main className="p-6 md:p-12 max-w-7xl mx-auto">

        {/* Thin status strip — real info, no marketing greeting */}
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3 pb-4 border-b border-white/[0.06]">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{userData?.full_name}</h1>
            <p className="text-[11px] text-gray-500 font-mono mt-0.5">
              CNIC {userData?.cnic} · {address?.slice(0, 6)}…{address?.slice(-4)}
            </p>
          </div>
          <div className="flex items-center gap-5 text-[11px] text-gray-400">
            <span><span className="text-white font-medium">{plots.filter(p => p.isMinted).length}</span>/{plots.length} on-chain</span>
            <span><span className="text-white font-medium">{plots.filter(p => p.isListedOnChain).length}</span> listed</span>
            <span><span className="text-white font-medium">{plots.filter(p => p.landStatus === 1 || p.landStatus === 2).length}</span> locked</span>
          </div>
        </header>

        {notice && (
          <div className={`mb-6 px-4 py-3 rounded-lg border text-sm flex items-start justify-between gap-3 ${
            notice.tone === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-200'
              : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-200'
          }`}>
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100 text-lg leading-none" aria-label="Dismiss">×</button>
          </div>
        )}

        <h2 className="text-base font-semibold mb-4 tracking-tight text-gray-300">Property portfolio</h2>
        {plots.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {plots.map((plot) => (
              <div
                key={plot.land_id}
                className={`p-6 rounded-xl flex flex-col justify-between transition-colors overflow-hidden bg-white/[0.02] ${
                  plot.isMinted ? 'border border-white/[0.12] hover:bg-white/[0.04]' : 'border border-white/[0.06]'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <span className="bg-white/5 border border-white/10 text-gray-400 text-[10px] px-2.5 py-1 rounded-md font-mono tracking-wider">
                      {plot.land_id}
                    </span>
                    {plot.isMinted ? (
                      <span className="text-[10px] text-gray-400 px-2.5 py-1 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full" /> On-Chain
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500 px-2.5 py-1">Offline Record</span>
                    )}
                  </div>

                  <h3 className="text-lg font-medium mb-1.5">{plot.location}</h3>
                  <p className="text-gray-500 text-sm mb-4 flex items-center gap-2">
                    <MapPin size={14} className="text-gray-400" strokeWidth={1.5} />
                    {plot.area_sq_yards} Sq Yards
                  </p>

                  {plot.isMinted && plot.landStatus !== undefined && plot.landStatus > 0 && (
                    <div className={`text-[10px] px-2.5 py-1.5 rounded-md mb-4 flex items-center gap-1.5 ${
                      plot.landStatus === 1
                        ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                      <ShieldAlert size={11} />
                      {LAND_STATUS_LABEL[plot.landStatus]}
                    </div>
                  )}
                </div>

                {plot.isMinted ? (
                  <div className="space-y-2.5">
                    {plot.landStatus === 0 && (
                      <>
                        {!plot.isListedOnChain ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => { setSelectedLand(plot); setListingModalOpen(true); }}
                              className="w-full bg-white hover:bg-gray-100 text-black py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                            >
                              <Tag size={14} strokeWidth={1.5} /> Sell via Marketplace
                            </button>
                            <button
                              onClick={() => { setSelectedLand(plot); setTransferModalOpen(true); }}
                              className="w-full bg-transparent border border-white/10 hover:bg-white/5 text-gray-300 py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                            >
                              <ArrowRightLeft size={14} strokeWidth={1.5} /> Direct Transfer
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 border border-white/[0.08] bg-white/[0.02] p-3 rounded-xl">
                            <div className="text-center text-[11px] text-gray-300 mb-2">Active on Marketplace</div>
                            <button
                              onClick={() => handleCancelListing(plot.land_id)}
                              disabled={!!cancelingId}
                              className="w-full bg-transparent hover:bg-white/5 text-gray-400 border border-white/10 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-1.5"
                            >
                              {cancelingId === plot.land_id && (isCancelingWallet || isCancelingChain)
                                ? <Loader2 className="animate-spin" size={12} />
                                : <XCircle size={12} strokeWidth={1.5} />
                              }
                              Cancel Listing
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {(plot.landStatus === 1 || plot.landStatus === 2) && (
                      <div className="text-center text-[11px] text-gray-500 py-2">
                        This plot is locked. No transactions allowed until resolved.
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleMintRequest(plot.land_id)}
                    disabled={!!mintingPlotId}
                    className="w-full bg-white hover:bg-gray-100 text-black py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {mintingPlotId === plot.land_id ? (
                      <><Loader2 className="animate-spin" size={16} /> Minting…</>
                    ) : (
                      <><CheckCircle size={14} strokeWidth={1.5} /> Verify & Mint NFT</>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 rounded-xl border border-white/[0.06] bg-white/[0.02] text-center">
            <p className="text-sm text-gray-300 font-medium mb-1">No properties yet</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
              No land records are linked to your CNIC in the government database. If you believe this
              is incorrect, contact the local revenue office or ensure your CNIC matches the one on
              file with the government.
            </p>
          </div>
        )}

        {/* ── Succession Plans ──────────────────────────────────────────── */}
        <div className="mt-12">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold tracking-tight text-gray-300">Succession plans</h2>
            <span className="text-[11px] text-gray-600">heir voting</span>
          </div>
          <p className="text-gray-500 text-xs mb-4">
            If you&apos;re listed as an heir, enter the <span className="text-gray-400">original (deceased owner&apos;s) land ID</span> below to approve or dispute.
          </p>

          <div className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.02] max-w-xl">
            <div className="flex gap-3">
              <input
                type="text"
                value={heirLandId}
                onChange={(e) => { setHeirLandId(e.target.value); setHeirPlan(null); setHeirCheckError(''); }}
                placeholder="Old Land ID (e.g. LND-001)"
                className="flex-1 bg-black/30 border border-white/10 px-4 py-2.5 rounded-lg text-white text-sm font-mono outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleCheckPlan}
                disabled={isCheckingPlan || !heirLandId.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {isCheckingPlan ? <Loader2 size={14} className="animate-spin" /> : null}
                Check
              </button>
            </div>

            {heirCheckError && <p className="mt-3 text-red-400 text-xs">{heirCheckError}</p>}

            {heirPlan && (
              <div className="mt-4 space-y-3">

                {heirPlan.status === 0 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                    <Info size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-300 font-medium">No succession plan found for this land</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        The land with this ID is currently <span className="text-gray-400 font-medium">Active</span> — no inheritance has been initiated yet. Make sure you are entering the <span className="text-gray-400">old (deceased owner&apos;s) Land ID</span>, not your own.
                      </p>
                    </div>
                  </div>
                )}

                {heirPlan.status === 1 && (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Status:</span>
                      <span className={`font-medium ${heirPlan.isExecuted ? 'text-green-400' : 'text-yellow-400'}`}>
                        {heirPlan.isExecuted ? 'Executed — Completed' : 'Pending Heir Votes'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Heir approvals:</span>
                      <span className="font-mono text-white">{String(heirPlan.approvalCount)}</span>
                    </div>

                    {heirPlan.isExecuted ? (
                      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                        <CheckCircle size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-green-300 font-medium">Succession plan fully executed</p>
                          <p className="text-xs text-green-400/70 mt-0.5">
                            All heirs approved. The original NFT was burned and new land deeds minted to each heir&apos;s wallet. Check your Property Portfolio above.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 pt-1">
                        <button onClick={handleApprove} disabled={isApprovePending || isApproveConfirming}
                          className="flex-1 bg-green-600 hover:bg-green-500 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2">
                          {(isApprovePending || isApproveConfirming) && <Loader2 size={14} className="animate-spin" />}
                          <ShieldCheck size={14} /> Approve Plan
                        </button>
                        <button onClick={handleDispute} disabled={isDisputePending || isDisputeConfirming}
                          className="flex-1 bg-red-700 hover:bg-red-600 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2">
                          {(isDisputePending || isDisputeConfirming) && <Loader2 size={14} className="animate-spin" />}
                          <ShieldAlert size={14} /> Dispute
                        </button>
                      </div>
                    )}
                  </>
                )}

                {heirPlan.status === 2 && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <ShieldAlert size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-red-300 font-medium">Dispute Locked</p>
                      <p className="text-xs text-red-400/70 mt-0.5">
                        An heir disputed this plan. The land is locked — no transfers allowed. Awaiting admin resolution via the Government Portal.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        {selectedLand && (
          <CreateListingModal
            isOpen={isListingModalOpen}
            onClose={() => setListingModalOpen(false)}
            land={selectedLand}
            sellerAddress={address as string}
            onSuccess={(txHash) => {
              setTxToast({ hash: txHash, message: `${selectedLand.land_id} is now listed on the marketplace!` });
              void loadData();
            }}
          />
        )}
        {selectedLand && (
          <TransferModal
            isOpen={isTransferModalOpen}
            onClose={() => setTransferModalOpen(false)}
            landId={selectedLand.land_id}
            location={selectedLand.location}
            onSuccess={(txHash) => { setTxToast({ hash: txHash, message: 'Ownership transferred on-chain!' }); void loadData(); }}
          />
        )}
      </main>

      {txToast && (
        <TxToast txHash={txToast.hash} message={txToast.message} onDismiss={() => setTxToast(null)} />
      )}
    </div>
  );
}
