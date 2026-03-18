'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { supabase } from '@/src/lib/supabase';
import { marketDb } from '@/src/lib/marketplace';
import Navbar from '@/src/components/Navbar';
import { Loader2, MapPin, CheckCircle, Tag, XCircle, Handshake } from 'lucide-react';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import CreateListingModal from '@/src/components/CreateListingModal';
import FinalizeSaleModal from '@/src/components/FinalizeSaleModal';

interface Plot {
    land_id: string;
    owner_cnic: string;
    location: string;
    area_sq_yards: number;
    isMinted?: boolean;
    listingStatus?: 'listed' | 'on_chain' | 'sold' | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function UserDashboard() {
    const { address } = useAccount();
    const publicClient = usePublicClient();
    
    const { writeContract: mintWriteContract, isPending: isMintingWallet, data: mintTxHash } = useWriteContract();
    const { isLoading: isMintingChain, isSuccess: isMintConfirmed } = useWaitForTransactionReceipt({ hash: mintTxHash });

    // Hydration & State
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const [userData, setUserData] = useState<{ full_name: string; cnic: string } | null>(null);
    const [plots, setPlots] = useState<Plot[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [mintingPlotId, setMintingPlotId] = useState<string | null>(null);
    const [cancelingId, setCancelingId] = useState<string | null>(null);

    // Modals
    const [isListingModalOpen, setListingModalOpen] = useState(false);
    const [isFinalizeModalOpen, setFinalizeModalOpen] = useState(false);
    const [selectedLand, setSelectedLand] = useState<Plot | null>(null);

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
        const full_name = String(profile?.[0] ?? '');
        const cnic = String(profile?.[1] ?? '');
        const isRegistered = Boolean(profile?.[2]);

        if (!isRegistered || !cnic) {
            setIsLoading(false);
            return;
        }

        setUserData({ full_name, cnic });

        // 1. Fetch from Govt DB
        const { data: govtData } = await supabase.from('govt_land_records').select('*').eq('owner_cnic', cnic);

        // 2. Fetch from Market DB
        const { data: marketListings } = await marketDb.from('listings').select('land_id, status').eq('seller_wallet', address);

        if (govtData) {
            // 3. Merge with Blockchain state
            const mergedPlots = await Promise.all(govtData.map(async (plot) => {
                let isMinted = false;
                try {
                    const record = await publicClient.readContract({
                        address: CONTRACT_ADDRESS as `0x${string}`,
                        abi: CONTRACT_ABI,
                        functionName: 'getLandRecord',
                        args: [plot.land_id]
                    }) as { currentOwner: string };
                    isMinted = record.currentOwner !== ZERO_ADDRESS;
                } catch (e) { isMinted = false; }

                const listing = marketListings?.find(l => l.land_id === plot.land_id);

                return { ...plot, isMinted, listingStatus: listing ? listing.status : null };
            }));
            setPlots(mergedPlots as Plot[]);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        if (mounted && userProfile && !isContractLoading) {
            void loadData();
        }
    }, [mounted, userProfile, isContractLoading, publicClient, address]);

    // --- ACTIONS ---

    const handleMintRequest = async (landId: string) => {
        if (!address) return alert("Wallet not connected!");
        setMintingPlotId(landId);
        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAddress: address, landId }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result?.error || 'Verification failed');
            alert(`Plot ${landId} minted successfully!\nTx: ${result.txHash}`);
            loadData(); // Refresh UI
        } catch (e: any) { alert(`Error:\n${e.message}`); }
        setMintingPlotId(null);
    };

    const { writeContract, data: cancelTxHash, isPending: isCancelingWallet } = useWriteContract();
    const { isLoading: isCancelingChain, isSuccess: isCancelConfirmed } = useWaitForTransactionReceipt({ hash: cancelTxHash });

    const handleCancelListing = (landId: string) => {
        if (!confirm("Remove this listing from the Blockchain?")) return;
        setCancelingId(landId);
        writeContract({
            address: CONTRACT_ADDRESS as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'cancelListing',
            args: [landId]
        });
    };

    useEffect(() => {
        if (isCancelConfirmed && cancelingId) {
            marketDb.from('listings').update({ status: 'listed' }).eq('land_id', cancelingId)
                .then(() => {
                    alert("Listing Cancelled Successfully.");
                    setCancelingId(null);
                    loadData();
                });
        }
    }, [isCancelConfirmed]);

    // Professional Hydration Check
    if (!mounted) return null;

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-brand-dark"><Loader2 className="animate-spin text-brand-primary" size={48} /></div>;
    }

    return (
        <div className="min-h-screen bg-brand-dark text-white">
            <Navbar />
            <main className="p-6 md:p-12 max-w-7xl mx-auto">
                <header className="mb-12 animate-[fadeUp_0.4s_ease]">
                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Welcome, <span className="text-white">{userData?.full_name}</span></h1>
                    <p className="text-gray-500 mt-2 text-sm">Managing properties registered to CNIC: <span className="font-mono text-gray-400">{userData?.cnic}</span></p>
                </header>

                <h2 className="text-xl font-semibold mb-6 tracking-tight">Your Property Portfolio</h2>

                {plots.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {plots.map((plot) => (
                            <div key={plot.land_id} className={`p-6 rounded-xl flex flex-col justify-between transition-colors overflow-hidden bg-white/[0.02] ${plot.isMinted ? 'border border-white/[0.12] hover:bg-white/[0.04]' : 'border border-white/[0.06]'}`}>
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
                                            <span className="text-[10px] text-gray-500 px-2.5 py-1">
                                                Offline Record
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="text-lg font-medium mb-1.5">{plot.location}</h3>
                                    <p className="text-gray-500 text-sm mb-6 flex items-center gap-2">
                                        <MapPin size={14} className="text-gray-400" strokeWidth={1.5} /> {plot.area_sq_yards} Sq Yards
                                    </p>
                                </div>

                                {/* DYNAMIC BUTTON LOGIC */}
                                {plot.isMinted ? (
                                    <div className="space-y-2.5">
                                        {!plot.listingStatus && (
                                            <button onClick={() => { setSelectedLand(plot); setListingModalOpen(true); }} className="w-full bg-white hover:bg-gray-100 text-black py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2">
                                                <Tag size={14} strokeWidth={1.5} /> Sell via Marketplace
                                            </button>
                                        )}

                                        {plot.listingStatus === 'listed' && (
                                            <div className="space-y-2">
                                                <div className="text-center text-[11px] text-gray-400 border border-white/[0.08] bg-white/[0.02] py-1.5 rounded-md">Listed (Negotiating)</div>
                                                <button onClick={() => { setSelectedLand(plot); setFinalizeModalOpen(true); }} className="w-full bg-white hover:bg-gray-100 text-black py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2">
                                                    <Handshake size={14} strokeWidth={1.5} /> Finalize Price
                                                </button>
                                            </div>
                                        )}

                                        {plot.listingStatus === 'on_chain' && (
                                            <div className="space-y-2 border border-white/[0.08] bg-white/[0.02] p-3 rounded-xl">
                                                <div className="text-center text-[11px] text-gray-300 mb-2">Active on Marketplace</div>
                                                <button onClick={() => handleCancelListing(plot.land_id)} disabled={!!cancelingId} className="w-full bg-transparent hover:bg-white/5 text-gray-400 border border-white/10 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 flex justify-center items-center gap-1.5">
                                                    {(cancelingId === plot.land_id && (isCancelingWallet || isCancelingChain)) ? <Loader2 className="animate-spin" size={12} /> : <XCircle size={12} strokeWidth={1.5} />}
                                                    Cancel Listing
                                                </button>
                                            </div>
                                        )}

                                        {plot.listingStatus === 'sold' && (
                                            <div className="w-full bg-white/[0.02] border border-white/[0.06] text-gray-500 py-2.5 rounded-lg text-center text-[11px] font-medium tracking-wide">
                                                Sold / Transferred
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
                                            <><Loader2 className="animate-spin" size={16} /> Minting...</>
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

                {/* MODALS */}
                {selectedLand && (
                    <CreateListingModal isOpen={isListingModalOpen} onClose={() => setListingModalOpen(false)} land={selectedLand} sellerAddress={address as string} onSuccess={loadData} />
                )}
                {selectedLand && (
                    <FinalizeSaleModal isOpen={isFinalizeModalOpen} onClose={() => setFinalizeModalOpen(false)} landId={selectedLand.land_id} onSuccess={loadData} />
                )}
            </main>
        </div>
    );
}