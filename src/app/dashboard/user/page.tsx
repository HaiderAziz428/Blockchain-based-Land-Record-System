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
                    <h1 className="text-3xl md:text-4xl font-bold">Welcome, <span className="text-brand-secondary">{userData?.full_name}</span></h1>
                    <p className="text-gray-400 mt-2">Managing properties registered to CNIC: <span className="font-mono text-white/80">{userData?.cnic}</span></p>
                </header>

                <h2 className="text-2xl font-bold mb-6">Your Property Portfolio</h2>

                {plots.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {plots.map((plot) => (
                            <div key={plot.land_id} className={`glass-card p-6 rounded-2xl flex flex-col justify-between transition-all duration-300 ${plot.isMinted ? 'border-brand-primary/30 shadow-[0_0_20px_rgba(99,102,241,0.1)]' : 'border-white/10'}`}>
                                <div>
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="bg-white/10 border border-white/20 text-white/80 text-xs px-3 py-1 rounded-full font-mono font-bold tracking-wider">
                                            {plot.land_id}
                                        </span>
                                        {plot.isMinted ? (
                                            <span className="text-xs bg-green-500/20 text-green-400 px-2.5 py-1 rounded-full border border-green-500/30 flex items-center gap-1">
                                                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> On-Chain
                                            </span>
                                        ) : (
                                            <span className="text-xs bg-gray-500/20 text-gray-400 px-2.5 py-1 rounded-full border border-gray-500/30">
                                                Offline Record
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="text-xl font-bold mb-2">{plot.location}</h3>
                                    <p className="text-gray-400 text-sm mb-6 flex items-center gap-2">
                                        <MapPin size={14} className="text-brand-secondary" /> {plot.area_sq_yards} Sq Yards
                                    </p>
                                </div>

                                {/* DYNAMIC BUTTON LOGIC */}
                                {plot.isMinted ? (
                                    <div className="space-y-3">
                                        {!plot.listingStatus && (
                                            <button onClick={() => { setSelectedLand(plot); setListingModalOpen(true); }} className="w-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary hover:text-white py-3 rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                                                <Tag size={16} /> Sell via Marketplace
                                            </button>
                                        )}

                                        {plot.listingStatus === 'listed' && (
                                            <div className="space-y-2">
                                                <div className="text-center text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 py-1.5 rounded-lg">Listed (Negotiating)</div>
                                                <button onClick={() => { setSelectedLand(plot); setFinalizeModalOpen(true); }} className="w-full bg-yellow-500/20 border border-yellow-500/40 hover:bg-yellow-500 text-yellow-300 hover:text-black py-3 rounded-xl font-bold transition-all flex justify-center items-center gap-2">
                                                    <Handshake size={16} /> Finalize Price
                                                </button>
                                            </div>
                                        )}

                                        {plot.listingStatus === 'on_chain' && (
                                            <div className="space-y-2 bg-green-500/10 border border-green-500/20 p-3 rounded-xl">
                                                <div className="text-center text-xs font-bold text-green-400 mb-2">Active on Marketplace ⚡</div>
                                                <button onClick={() => handleCancelListing(plot.land_id)} disabled={!!cancelingId} className="w-full bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white py-2 rounded-lg font-bold text-xs transition-all disabled:opacity-50 flex justify-center items-center gap-1">
                                                    {(cancelingId === plot.land_id && (isCancelingWallet || isCancelingChain)) ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />}
                                                    Cancel Listing
                                                </button>
                                            </div>
                                        )}

                                        {plot.listingStatus === 'sold' && (
                                            <div className="w-full bg-white/5 border border-white/10 text-white/50 py-3 rounded-xl text-center text-sm font-bold">
                                                Sold / Transferred
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleMintRequest(plot.land_id)}
                                        disabled={!!mintingPlotId}
                                        className="w-full bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600 hover:text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {mintingPlotId === plot.land_id ? (
                                            <><Loader2 className="animate-spin" size={18} /> Minting...</>
                                        ) : (
                                            <><CheckCircle size={18} /> Verify & Mint NFT</>
                                        )}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="glass-card p-10 rounded-2xl text-center">
                        <p className="text-white/50">No properties found for your CNIC in the government database.</p>
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