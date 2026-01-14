'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { marketDb } from '@/src/lib/marketplace'; // New DB
import { supabase } from '@/src/lib/supabase';     // Govt DB
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import Header from '@/src/components/Header';
import { usePublicClient } from 'wagmi';

export default function Marketplace() {
    const [listings, setListings] = useState<any[]>([]);
    const { address, isConnected } = useAccount();

    // TRACKING STATE
    const [buyingId, setBuyingId] = useState<string | null>(null);
    const publicClient = usePublicClient(); // <--- ADD THIS

    // 1. READ BUYER IDENTITY (Needed for DB Sync)
    const { data: userProfile } = useReadContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'users',
        args: address ? [address] : undefined,
    });

    // 2. WAGMI HOOKS
    const { writeContract, data: hash, isPending: isWalletOpening, error: writeError } = useWriteContract();

    // 3. WAIT FOR RECEIPT (The Security Check)
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // --- FETCH LISTINGS (FIXED TO SHOW ALL) ---
    useEffect(() => {
        const fetchListings = async () => {
            // Fetch EVERYTHING that is not sold yet.
            // This includes 'listed' (Web2) and 'on_chain' (Web3)
            const { data, error } = await marketDb
                .from('listings')
                .select('*')
                .neq('status', 'sold')
                .order('created_at', { ascending: false });

            if (error) console.error("Market Error:", error);
            if (data) setListings(data);
        };
        fetchListings();
    }, [isSuccess]); // Refresh list automatically after a sale


    // --- HANDLE BUY ACTION ---
    const handleBuy = async (landId: string, priceEth: number, sellerWallet: string) => {

        // CHECK 1: Is Wallet Connected?
        if (!isConnected || !address) {
            alert("❌ Error: Please connect your wallet.");
            return;
        }

        // CHECK 2: Are you buying your own land?
        if (sellerWallet.toLowerCase() === address.toLowerCase()) {
            alert("❌ Error: You are the Seller. You cannot buy your own land.");
            return;
        }

        // CHECK 3: Are YOU (The Buyer) Registered?
        console.log("🔍 Checking Buyer Registration...");
        const userProfile = await publicClient?.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'users',
            args: [address]
        }) as [string, string, boolean];

        const isRegistered = userProfile[2]; // Index 2 is bool
        if (!isRegistered) {
            alert("❌ ACCESS DENIED: Your Buyer Wallet is NOT registered.\n\nGo to Home Page -> Connect this Wallet -> Click 'Citizen Portal' -> Register with CNIC.");
            return;
        }

        // CHECK 4: Is the Land actually Listed on Blockchain?
        console.log("🔍 Checking Contract State for Land:", landId);
        let listing: [bigint, string, boolean, bigint] | null = null;
        let isActive = false;
        let sellerOnChain = '';
        let priceOnChain: bigint | null = null;

        try {
            const result = await publicClient?.readContract({
                address: CONTRACT_ADDRESS,
                abi: CONTRACT_ABI,
                functionName: 'landListings',
                args: [landId]
            }) as [bigint, string, boolean, bigint] | undefined;
            // Struct: [price, seller, isActive, deadline]

            if (result) {
                listing = result;
                isActive = result[2];
                sellerOnChain = result[1];
                priceOnChain = result[0];
            }
        } catch (error: any) {
            console.error("Error reading landListings:", error);
            // If the function reverts or returns null, the land is not listed
            isActive = false;
        }

        // If listing doesn't exist or is not active, block the purchase
        // Seller must finalize the price first (which calls listLandForSale on-chain)
        if (!listing || !isActive) {
            alert(`⚠️ This property is not yet listed on the blockchain.\n\nLand: ${landId}\n\nPlease ask the seller to:\n1. Click "Finalize Agreed Price" button\n2. Complete the on-chain listing\n\nOnce listed on-chain, you can purchase instantly.`);
            return;
        }

        // CHECK 5: Verify Price Match (Only if we have valid contract listing data)
        const priceToSend = parseEther(priceEth.toString());

        // If listing exists on contract, verify it matches
        if (listing && isActive) {
            if (priceOnChain && priceOnChain !== priceToSend) {
                const chainPriceEth = Number(priceOnChain) / 1e18;
                alert(`❌ PRICE MISMATCH:\n\nBlockchain Price: ${chainPriceEth} ETH\nYour Price: ${priceEth} ETH\n\nPlease refresh the page or contact seller to update the listing.`);
                return;
            }

            // Verify Seller Match (if contract listing exists)
            if (sellerOnChain && sellerOnChain.toLowerCase() !== sellerWallet.toLowerCase()) {
                console.warn(`⚠️ Seller mismatch detected:\nDatabase: ${sellerWallet}\nBlockchain: ${sellerOnChain}`);
            }
        } else {
            // If no contract listing, just proceed with DB-based purchase
            // This is the hybrid approach where DB tracks status and contract handles transfer
            console.log(`ℹ️ No contract listing found. Proceeding with direct purchase for ${priceEth} ETH`);
        }

        // --- IF WE PASS ALL CHECKS, EXECUTE ---
        if (!confirm(`✅ All Checks Passed!\n\nBuy Land ${landId} for ${priceEth} ETH?`)) return;

        setBuyingId(landId);

        // Call buyLand function - requires listing to exist on-chain first
        writeContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'buyLand',
            args: [landId],
            value: priceToSend
        } as any);
    };

    // --- SAFE DB SYNC (RUNS ONLY AFTER BLOCKCHAIN SUCCESS) ---
    useEffect(() => {
        const syncDatabase = async () => {
            // Only run if Blockchain said "SUCCESS" and we have a buying ID
            if (isSuccess && buyingId && userProfile) {
                console.log("✅ Blockchain Confirmed. Now updating Databases...");

                // @ts-ignore
                const buyerCnic = userProfile[1]; // Get Buyer's CNIC from Chain Data

                try {
                    // 1. Update GOVT DB (Transfer Ownership)
                    // This moves the land to the Buyer's Dashboard
                    const { error: govtError } = await supabase
                        .from('govt_land_records')
                        .update({ owner_cnic: buyerCnic })
                        .eq('land_id', buyingId);

                    if (govtError) throw govtError;

                    // 2. Update MARKET DB (Mark Sold)
                    // This removes it from the Marketplace view
                    const { error: marketError } = await marketDb
                        .from('listings')
                        .update({ status: 'sold' })
                        .eq('land_id', buyingId);

                    if (marketError) throw marketError;

                    alert("Purchase Successful! \nOwnership Transferred.\nGovt Records Updated.");
                    setBuyingId(null);

                } catch (err) {
                    console.error(err);
                    alert("CRITICAL: Blockchain Success, but Database Sync Failed. \nPlease contact support with Tx Hash.");
                }
            }
        };

        syncDatabase();
    }, [isSuccess, buyingId, userProfile]);

    return (
        <div className="min-h-screen bg-[#020817] text-white">
            <Header />
            <main className="pt-32 px-6 max-w-7xl mx-auto">
                <h1 className="text-4xl font-bold mb-8">Property Marketplace</h1>

                {/* ERROR DISPLAY */}
                {writeError && (
                    <div className="bg-red-500/10 border border-red-500/50 p-4 mb-6 rounded text-red-400">
                        Transaction Failed: {writeError.message.split('\n')[0]}
                        <br />
                        <span className="text-xs text-gray-400">Hint: Are you registered? Are you buying your own land? Is price correct?</span>
                    </div>
                )}

                {listings.length === 0 ? (
                    <div className="text-gray-500 text-center py-20 border border-white/10 rounded-xl bg-white/5">
                        No active properties found. Be the first to list!
                    </div>
                ) : (
                    <div className="grid md:grid-cols-3 gap-8">
                        {listings.map((item) => (
                            <div key={item.id} className="bg-[#1e293b] rounded-2xl overflow-hidden border border-white/10 hover:border-blue-500/50 transition-all shadow-lg">

                                {/* PHOTO SECTION */}
                                <div className="h-48 bg-slate-800 relative group">
                                    {item.photos && item.photos[0] ? (
                                        <img src={`https://gateway.pinata.cloud/ipfs/${item.photos[0]}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500">No Photo</div>
                                    )}
                                    <span className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs font-bold backdrop-blur-sm">
                                        {item.land_type}
                                    </span>
                                    {/* Status Badge */}
                                    <span className={`absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold backdrop-blur-sm ${item.status === 'on_chain' ? 'bg-green-600/80 text-white' : 'bg-yellow-600/80 text-white'
                                        }`}>
                                        {item.status === 'on_chain' ? 'Active on Chain ⚡' : 'Negotiating 🤝'}
                                    </span>
                                </div>

                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-xl font-bold truncate">{item.location}</h3>
                                        <span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded font-mono">{item.land_id}</span>
                                    </div>

                                    <p className="text-gray-400 text-sm mb-4 line-clamp-2 h-10">{item.description}</p>

                                    {/* CONDITIONAL PRICE SECTION */}
                                    {item.status === 'listed' ? (
                                        // CASE A: LISTED (Negotiation Phase)
                                        <div className="bg-white/5 p-3 rounded-lg mb-4 border border-white/10">
                                            <p className="text-xs text-gray-500 mb-1">Asking Range</p>
                                            <div className="flex justify-between items-end">
                                                <p className="font-mono text-yellow-400 font-bold">{item.price_min} - {item.price_max} ETH</p>
                                            </div>

                                            <a href={`https://wa.me/${item.whatsapp}`} target="_blank"
                                                className="mt-3 flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 py-2 rounded font-bold text-sm transition-colors">
                                                <span>💬</span> Negotiate on WhatsApp
                                            </a>
                                        </div>
                                    ) : (
                                        // CASE B: ON CHAIN (Buy Phase)
                                        <div className="bg-green-900/20 border border-green-500/30 p-3 rounded-lg mb-4">
                                            <p className="text-xs text-green-400 mb-1">Final Verified Price</p>
                                            <p className="text-2xl font-bold text-white">{item.final_price} ETH</p>
                                        </div>
                                    )}

                                    {/* ACTION BUTTON */}
                                    {item.status === 'on_chain' && (
                                        <button
                                            onClick={() => handleBuy(item.land_id, item.final_price, item.seller_wallet)}
                                            disabled={!!buyingId} // Disable if buying any item
                                            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)] transition-all"
                                        >
                                            {buyingId === item.land_id && isWalletOpening ? 'Check Wallet...' :
                                                buyingId === item.land_id && isConfirming ? 'Processing Transaction...' :
                                                    'Buy Now ⚡'}
                                        </button>
                                    )}

                                    {item.status === 'listed' && (
                                        <p className="text-[10px] text-center text-gray-500 italic">
                                            Contact seller to agree on a final price.
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}