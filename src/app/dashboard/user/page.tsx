'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { supabase } from '@/src/lib/supabase';
import { marketDb } from '@/src/lib/marketplace';
import Navbar from '@/src/components/Navbar';
import { Loader2, MapPin, CheckCircle, Tag, XCircle, Handshake, ArrowRightLeft, ShieldCheck, ShieldAlert } from 'lucide-react';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import CreateListingModal from '@/src/components/CreateListingModal';
import FinalizeSaleModal from '@/src/components/FinalizeSaleModal';
import TransferModal from '@/src/components/TransferModal';

interface Plot {
    land_id: string;
    owner_cnic: string;
    location: string;
    area_sq_yards: number;
    isMinted?: boolean;
    landStatus?: number; // 0=ACTIVE 1=PENDING_INHERITANCE 2=LOCKED_DISPUTE
    listingStatus?: 'listed' | 'on_chain' | 'sold' | null;
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

    // Hydration guard
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Core state
    const [userData, setUserData] = useState<{ full_name: string; cnic: string } | null>(null);
    const [plots, setPlots] = useState<Plot[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Action states
    const [mintingPlotId, setMintingPlotId] = useState<string | null>(null);
    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const cancelProcessedRef = useRef(false);

    // Modals
    const [isListingModalOpen, setListingModalOpen] = useState(false);
    const [isFinalizeModalOpen, setFinalizeModalOpen] = useState(false);
    const [isTransferModalOpen, setTransferModalOpen] = useState(false);
    const [selectedLand, setSelectedLand] = useState<Plot | null>(null);

    // Inheritance heir actions
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

        if (!isRegistered || !cnic) {
            setIsLoading(false);
            return;
        }
        setUserData({ full_name, cnic });

        const { data: govtData } = await supabase.from('govt_land_records').select('*').eq('owner_cnic', cnic);
        const { data: marketListings } = await marketDb.from('listings').select('land_id, status').eq('seller_wallet', address);

        if (govtData) {
            const mergedPlots = await Promise.all(
                govtData.map(async (plot) => {
                    let isMinted = false;
                    let landStatus = 0;
                    try {
                        const record = await publicClient.readContract({
                            address: CONTRACT_ADDRESS as `0x${string}`,
                            abi: CONTRACT_ABI,
                            functionName: 'getLandRecord',
                            args: [plot.land_id],
                        }) as { currentOwner: string; status: number };
                        isMinted = record.currentOwner !== ZERO_ADDRESS;
                        landStatus = Number(record.status);
                    } catch { isMinted = false; }

                    const listing = marketListings?.find(l => l.land_id === plot.land_id);
                    return { ...plot, isMinted, landStatus, listingStatus: listing ? listing.status : null };
                })
            );
            setPlots(mergedPlots as Plot[]);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (mounted && userProfile && !isContractLoading) {
            void loadData();
        }
    }, [mounted, userProfile, isContractLoading, publicClient, address]);

    // ── Mint ──────────────────────────────────────────────────────────────────
    const handleMintRequest = async (landId: string) => {
        if (!address) return alert('Wallet not connected!');
        setMintingPlotId(landId);
        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAddress: address, landId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result?.error || 'Verification failed');
            alert(`Plot ${landId} minted!\nTx: ${result.txHash}`);
            void loadData();
        } catch (e: unknown) {
            alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
        setMintingPlotId(null);
    };

    // ── Cancel Listing ────────────────────────────────────────────────────────
    const { writeContract: cancelWrite, data: cancelTxHash, isPending: isCancelingWallet } = useWriteContract();
    const { isLoading: isCancelingChain, isSuccess: isCancelConfirmed } = useWaitForTransactionReceipt({ hash: cancelTxHash });

    const handleCancelListing = (landId: string) => {
        if (!confirm('Remove this listing from the Blockchain?')) return;
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
        if (!isCancelConfirmed || !cancelingId || cancelProcessedRef.current) return;
        cancelProcessedRef.current = true;
        marketDb.from('listings').delete().eq('land_id', cancelingId).then(() => {
            alert('Listing cancelled and removed from marketplace.');
            setCancelingId(null);
            void loadData();
        });
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
                }) as Promise<{ status: number }>,
                publicClient.readContract({
                    address: CONTRACT_ADDRESS as `0x${string}`,
                    abi: CONTRACT_ABI,
                    functionName: 'inheritanceRequests',
                    args: [heirLandId.trim()],
                }) as Promise<[bigint, boolean]>,
            ]);
            setHeirPlan({ status: Number(record.status), approvalCount: plan[0], isExecuted: plan[1] });
        } catch {
            setHeirCheckError('Could not find this land ID on-chain. Check the ID and try again.');
        }
        setIsCheckingPlan(false);
    };

    const handleApprove = () => {
        approveProcessedRef.current = false;
        approveWrite({
            address: CONTRACT_ADDRESS as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'approveSuccessionPlan',
            args: [heirLandId.trim()],
        });
    };

    const handleDispute = () => {
        disputeProcessedRef.current = false;
        disputeWrite({
            address: CONTRACT_ADDRESS as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'disputeSuccessionPlan',
            args: [heirLandId.trim()],
        });
    };

    useEffect(() => {
        if (isApproveSuccess && !approveProcessedRef.current) {
            approveProcessedRef.current = true;
            alert('Approval submitted. Plan will execute when all heirs approve.');
            void handleCheckPlan();
        }
    }, [isApproveSuccess]);

    useEffect(() => {
        if (isDisputeSuccess && !disputeProcessedRef.current) {
            disputeProcessedRef.current = true;
            alert('Dispute registered. The land is now locked pending admin resolution.');
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

                {/* Header */}
                <header className="mb-12 animate-[fadeUp_0.4s_ease]">
                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                        Welcome, <span className="text-white">{userData?.full_name}</span>
                    </h1>
                    <p className="text-gray-500 mt-2 text-sm">
                        CNIC: <span className="font-mono text-gray-400">{userData?.cnic}</span>
                    </p>
                </header>

                {/* Property Portfolio */}
                <h2 className="text-xl font-semibold mb-6 tracking-tight">Your Property Portfolio</h2>
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

                                    {/* Land status badge for locked states */}
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

                                {/* Dynamic Action Buttons */}
                                {plot.isMinted ? (
                                    <div className="space-y-2.5">
                                        {/* Only show marketplace/transfer actions if land is ACTIVE */}
                                        {plot.landStatus === 0 && (
                                            <>
                                                {!plot.listingStatus && (
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
                                                )}

                                                {plot.listingStatus === 'listed' && (
                                                    <div className="space-y-2">
                                                        <div className="text-center text-[11px] text-gray-400 border border-white/[0.08] bg-white/[0.02] py-1.5 rounded-md">
                                                            Listed (Negotiating)
                                                        </div>
                                                        <button
                                                            onClick={() => { setSelectedLand(plot); setFinalizeModalOpen(true); }}
                                                            className="w-full bg-white hover:bg-gray-100 text-black py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                                                        >
                                                            <Handshake size={14} strokeWidth={1.5} /> Finalize Price
                                                        </button>
                                                    </div>
                                                )}

                                                {plot.listingStatus === 'on_chain' && (
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

                                                {plot.listingStatus === 'sold' && (
                                                    <div className="w-full bg-white/[0.02] border border-white/[0.06] text-gray-500 py-2.5 rounded-lg text-center text-[11px] font-medium">
                                                        Sold / Transferred
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Locked state — no actions */}
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
                        <p className="text-gray-500 text-sm">No properties found for your CNIC in the government database.</p>
                    </div>
                )}

                {/* ── Succession Plan (Heir Actions) ───────────────────────── */}
                <div className="mt-16">
                    <h2 className="text-xl font-semibold mb-2 tracking-tight">Succession Plans</h2>
                    <p className="text-gray-500 text-sm mb-6">
                        If you are listed as an heir for a land, enter its ID below to approve or dispute the succession plan.
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

                        {heirCheckError && (
                            <p className="mt-3 text-red-400 text-xs">{heirCheckError}</p>
                        )}

                        {heirPlan && (
                            <div className="mt-4 space-y-3">
                                <div className="text-sm text-gray-300">
                                    Status: <span className={`font-medium ${
                                        heirPlan.status === 1 ? 'text-yellow-400' :
                                        heirPlan.status === 2 ? 'text-red-400' : 'text-green-400'
                                    }`}>{LAND_STATUS_LABEL[heirPlan.status] ?? 'Active'}</span>
                                    {heirPlan.status === 1 && (
                                        <span className="ml-3 text-gray-500 text-xs">
                                            {String(heirPlan.approvalCount)} approval(s) so far
                                            {heirPlan.isExecuted ? ' · Executed' : ''}
                                        </span>
                                    )}
                                </div>

                                {heirPlan.status === 1 && !heirPlan.isExecuted && (
                                    <div className="flex gap-3">
                                        <button
                                            onClick={handleApprove}
                                            disabled={isApprovePending || isApproveConfirming}
                                            className="flex-1 bg-green-600 hover:bg-green-500 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2"
                                        >
                                            {(isApprovePending || isApproveConfirming) && <Loader2 size={14} className="animate-spin" />}
                                            <ShieldCheck size={14} /> Approve Plan
                                        </button>
                                        <button
                                            onClick={handleDispute}
                                            disabled={isDisputePending || isDisputeConfirming}
                                            className="flex-1 bg-red-700 hover:bg-red-600 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 flex justify-center items-center gap-2"
                                        >
                                            {(isDisputePending || isDisputeConfirming) && <Loader2 size={14} className="animate-spin" />}
                                            <ShieldAlert size={14} /> Dispute
                                        </button>
                                    </div>
                                )}

                                {heirPlan.status === 2 && (
                                    <p className="text-xs text-red-400">This land is locked due to a dispute. Awaiting admin resolution.</p>
                                )}

                                {heirPlan.isExecuted && (
                                    <p className="text-xs text-green-400">Succession plan has been executed. New deeds are minted.</p>
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
                        onSuccess={() => { setListingModalOpen(false); void loadData(); }}
                    />
                )}
                {selectedLand && (
                    <FinalizeSaleModal
                        isOpen={isFinalizeModalOpen}
                        onClose={() => setFinalizeModalOpen(false)}
                        landId={selectedLand.land_id}
                        onSuccess={() => { setFinalizeModalOpen(false); void loadData(); }}
                    />
                )}
                {selectedLand && (
                    <TransferModal
                        isOpen={isTransferModalOpen}
                        onClose={() => setTransferModalOpen(false)}
                        landId={selectedLand.land_id}
                        location={selectedLand.location}
                        onSuccess={() => { setTransferModalOpen(false); void loadData(); }}
                    />
                )}
            </main>
        </div>
    );
}
