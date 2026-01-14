'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { supabase } from '@/src/lib/supabase'; // Old Govt DB
import { marketDb } from '@/src/lib/marketplace'; // New Market DB
import Header from '@/src/components/Header';
import CreateListingModal from '@/src/components/CreateListingModal';
import FinalizeSaleModal from '@/src/components/FinalizeSaleModal';
import Link from 'next/link';

// Combined Type: Merges Govt DB + Blockchain + Market DB
interface LandProperty {
    land_id: string;
    location: string;
    area_sq_yards: number;
    isMinted: boolean;
    listingStatus?: 'listed' | 'on_chain' | 'sold' | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export default function UserDashboard() {
    const { address, isConnected } = useAccount();
    const publicClient = usePublicClient();

    const [loading, setLoading] = useState(true);
    const [myLands, setMyLands] = useState<LandProperty[]>([]);
    const [verifyingId, setVerifyingId] = useState<string | null>(null);

    // Modal States
    const [isListingModalOpen, setListingModalOpen] = useState(false);
    const [isFinalizeModalOpen, setFinalizeModalOpen] = useState(false);
    const [selectedLand, setSelectedLand] = useState<LandProperty | null>(null);

    // State to track which land is being canceled
    const [cancelingId, setCancelingId] = useState<string | null>(null);

    // Wagmi Hooks for Cancel Action
    const { writeContract, data: cancelTxHash, isPending: isWalletOpening } = useWriteContract();

    // 3. Wait for the Transaction to complete
    const { isLoading: isCanceling, isSuccess: isCancelConfirmed } = useWaitForTransactionReceipt({
        hash: cancelTxHash
    });

    // 4. THE HANDLER (Only starts the transaction)
    const handleCancelListing = (landId: string) => {
        if (!confirm("Are you sure you want to remove this listing?")) return;

        setCancelingId(landId); // Mark this ID so we know which one to update later

        writeContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'cancelListing',
            args: [landId]
        });
    };

    // 5. THE SYNC (Runs ONLY after Blockchain Success)
    useEffect(() => {
        const syncCancel = async () => {
            if (isCancelConfirmed && cancelingId) {
                console.log("Blockchain Confirmed. Reverting DB status...");

                // A. Update Market DB: Set status back to 'listed'
                // This makes the "Finalize Agreed Price" button reappear
                await marketDb.from('listings')
                    .update({ status: 'listed' })
                    .eq('land_id', cancelingId);

                // B. Update Local UI State
                setMyLands(prev => prev.map(l =>
                    l.land_id === cancelingId
                        ? { ...l, listingStatus: 'listed' } // Switch back to 'listed'
                        : l
                ));

                alert("Listing Cancelled Successfully. You can now negotiate a new price.");
                setCancelingId(null); // Reset tracker
            }
        };

        syncCancel();
    }, [isCancelConfirmed, cancelingId]);
    // 1. READ IDENTITY
    const { data: userProfile, isLoading: isContractLoading } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'users',
        args: address ? [address] : undefined,
    });

    // 2. FETCH DATA & MERGE (The Heavy Lifting)
    const loadData = async () => {
        if (!userProfile || !publicClient || !address) return;
        // @ts-ignore
        const cnic = userProfile[1];
        if (!cnic) return;

        setLoading(true);

        try {
            // A. Get "Expected" Lands from Govt DB
            const { data: govtLands } = await supabase
                .from('govt_land_records')
                .select('*')
                .eq('owner_cnic', cnic);

            if (!govtLands) {
                setLoading(false);
                return;
            }

            // B. Get Existing Listings from Market DB
            const { data: marketListings } = await marketDb
                .from('listings')
                .select('land_id, status')
                .eq('seller_wallet', address); // Only fetch my listings

            // C. Merge & Check Blockchain Status
            const mergedData = await Promise.all(govtLands.map(async (land) => {
                // Check Chain
                let isMinted = false;
                try {
                    const record = await publicClient.readContract({
                        address: CONTRACT_ADDRESS,
                        abi: CONTRACT_ABI,
                        functionName: 'getLandRecord',
                        args: [land.land_id]
                    }) as { currentOwner: string };

                    isMinted = record.currentOwner !== ZERO_ADDRESS;
                } catch (e) {
                    isMinted = false;
                }

                // Check Market DB
                const listing = marketListings?.find(l => l.land_id === land.land_id);

                return {
                    ...land,
                    isMinted,
                    listingStatus: listing ? listing.status : null
                };
            }));

            setMyLands(mergedData);
        } catch (error) {
            console.error("Error loading dashboard:", error);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        if (userProfile && !isContractLoading) {
            loadData();
        }
    }, [userProfile, isContractLoading, publicClient, address]);


    // 3. HANDLERS

    const openListingModal = (land: LandProperty) => {
        setSelectedLand(land);
        setListingModalOpen(true);
    }

    const openFinalizeModal = (land: LandProperty) => {
        setSelectedLand(land);
        setFinalizeModalOpen(true);
    }

    // AUTO-VERIFY HANDLER (Same as before)
    const handleVerify = async (landId: string) => {
        setVerifyingId(landId);
        try {
            const response = await fetch('/api/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userAddress: address, landId })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            alert(`Success! Land Minted.\nTx: ${result.txHash.slice(0, 10)}... \nPlease wait 15 seconds for the block to update.`);
            // Optimistic Update
            setMyLands(prev => prev.map(l => l.land_id === landId ? { ...l, isMinted: true } : l));
        } catch (err: any) {
            alert("Verification Error: " + err.message);
        } finally {
            setVerifyingId(null);
        }
    };

    if (!isConnected) return <div className="text-white pt-32 text-center">Please Connect Wallet</div>;

    return (
        <div className="min-h-screen bg-[#020817] text-white">
            <Header />

            <main className="pt-32 px-6 max-w-7xl mx-auto">
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">My Property Portfolio</h1>
                        <p className="text-gray-400">
                            Manage your assets, verify records, and list on marketplace.
                        </p>
                    </div>
                    <Link href="/marketplace" className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg font-bold">
                        Go to Marketplace &rarr;
                    </Link>
                </div>

                {loading ? (
                    <div className="text-blue-400 animate-pulse">Syncing Blockchain & Market Data...</div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {myLands.map((land) => (
                            <div key={land.land_id} className={`border p-6 rounded-xl transition-all ${land.isMinted ? 'bg-[#1e293b] border-green-500/30 shadow-lg shadow-green-900/10' : 'bg-[#1e293b] border-white/10'}`}>
                                {/* Status Header */}
                                <div className="flex justify-between mb-4">
                                    <span className="font-bold text-blue-400">{land.land_id}</span>
                                    {land.isMinted ? (
                                        <span className="text-green-400 text-xs bg-green-500/20 px-2 py-1 rounded border border-green-500/50">On-Chain ✅</span>
                                    ) : (
                                        <span className="text-gray-400 text-xs bg-gray-500/20 px-2 py-1 rounded">Offline Record 📄</span>
                                    )}
                                </div>

                                <h3 className="text-xl font-bold mb-1">{land.location}</h3>
                                <p className="text-gray-400 text-sm mb-6">{land.area_sq_yards} Sq/Yards</p>

                                {/* DYNAMIC BUTTONS BASED ON STATE */}
                                {land.isMinted ? (
                                    <div className="space-y-3">
                                        {/* STATUS 1: NOT LISTED YET */}
                                        {!land.listingStatus && (
                                            <button
                                                onClick={() => openListingModal(land)}
                                                className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-bold text-sm transition-colors"
                                            >
                                                Sell via Marketplace
                                            </button>
                                        )}

                                        {/* STATUS 2: LISTED (Negotiating Phase) */}
                                        {land.listingStatus === 'listed' && (
                                            <div className="space-y-2">
                                                <div className="text-center text-xs text-yellow-400 bg-yellow-500/10 py-1 rounded">
                                                    Listed (Waiting for Deal)
                                                </div>
                                                <button
                                                    onClick={() => openFinalizeModal(land)}
                                                    className="w-full bg-yellow-600 hover:bg-yellow-700 py-2 rounded font-bold text-sm text-white animate-pulse"
                                                >
                                                    Finalize Agreed Price ⚡
                                                </button>
                                            </div>
                                        )}

                                        {/* STATUS 3: ON CHAIN (Active) */}
                                        {land.listingStatus === 'on_chain' && (
                                            <div className="space-y-2 border border-green-500/30 p-2 rounded bg-green-900/10">
                                                <div className="text-center text-xs font-bold text-green-400">
                                                    Active on Marketplace 🟢
                                                </div>
                                                <p className="text-[10px] text-gray-400 text-center">
                                                    Locked for 7 Days / Waiting for Buyer
                                                </p>

                                                {/* THE CANCEL BUTTON */}
                                                <button
                                                    onClick={() => handleCancelListing(land.land_id)}
                                                    disabled={!!cancelingId} // Disable if any action is in progress
                                                    className="w-full bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-600/50 py-2 rounded font-bold text-xs transition-all disabled:opacity-50"
                                                >
                                                    {cancelingId === land.land_id && isWalletOpening ? 'Check Wallet...' :
                                                        cancelingId === land.land_id && isCanceling ? 'Canceling on Chain...' :
                                                            'Cancel Listing ✕'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleVerify(land.land_id)}
                                        disabled={!!verifyingId}
                                        className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg font-bold transition-all disabled:opacity-50 shadow-lg shadow-green-900/20"
                                    >
                                        {verifyingId === land.land_id ? 'Minting...' : 'Verify Record'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* --- MODALS --- */}

                {selectedLand && (
                    <CreateListingModal
                        isOpen={isListingModalOpen}
                        onClose={() => setListingModalOpen(false)}
                        land={selectedLand}
                        sellerAddress={address as string}
                        onSuccess={loadData} // Refresh dashboard to show new status
                    />
                )}

                {selectedLand && (
                    <FinalizeSaleModal
                        isOpen={isFinalizeModalOpen}
                        onClose={() => setFinalizeModalOpen(false)}
                        landId={selectedLand.land_id}
                        onSuccess={loadData} // Refresh dashboard to show new status
                    />
                )}

            </main>
        </div>
    );
}