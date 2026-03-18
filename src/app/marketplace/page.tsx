'use client';

import { useEffect, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { parseEther } from 'viem';
import Navbar from '@/src/components/Navbar';
import { marketDb } from '@/src/lib/marketplace';
import { supabase } from '@/src/lib/supabase';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

type Listing = {
  id: string | number;
  land_id: string;
  location?: string | null;
  description?: string | null;
  land_type?: string | null;
  photos?: string[] | null;
  status: 'listed' | 'on_chain' | 'sold';
  price_min?: number | null;
  price_max?: number | null;
  final_price?: number | null;
  whatsapp?: string | null;
  seller_wallet: string;
};

export default function MarketplacePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [listings, setListings] = useState<Listing[]>([]);
  const [buyingId, setBuyingId] = useState<string | null>(null);

  const { data: userProfile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'users',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { writeContract, data: hash, isPending: isWalletOpening, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const fetchListings = async () => {
    const { data, error } = await marketDb
      .from('listings')
      .select('*')
      .neq('status', 'sold')
      .order('created_at', { ascending: false });

    if (error) console.error('Market Error:', error);
    setListings((data as Listing[]) ?? []);
  };

  useEffect(() => {
    void fetchListings();
  }, [isSuccess]);

  const handleBuy = async (landId: string, finalPriceEth: number, sellerWallet: string) => {
    if (!isConnected || !address) {
      alert('❌ Error: Please connect your wallet.');
      return;
    }

    if (sellerWallet.toLowerCase() === address.toLowerCase()) {
      alert('❌ Error: You are the Seller. You cannot buy your own land.');
      return;
    }

    if (!publicClient) return;

    // CHECK: buyer registered
    const profile = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'users',
      args: [address],
    })) as [string, string, boolean];

    if (!profile[2]) {
      alert('❌ ACCESS DENIED: Your buyer wallet is not registered on-chain.');
      return;
    }

    // CHECK: listing is active on-chain
    const listing = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'landListings',
      args: [landId],
    })) as [bigint, string, boolean, bigint];

    const isActive = listing[2];
    const priceOnChain = listing[0];

    if (!isActive) {
      alert('⚠️ This property is not yet listed on-chain. Ask seller to finalize price.');
      return;
    }

    const priceToSend = parseEther(finalPriceEth.toString());
    if (priceOnChain !== priceToSend) {
      const chainPriceEth = Number(priceOnChain) / 1e18;
      alert(`❌ PRICE MISMATCH:\n\nBlockchain: ${chainPriceEth} ETH\nUI: ${finalPriceEth} ETH`);
      return;
    }

    if (!confirm(`Buy Land ${landId} for ${finalPriceEth} ETH?`)) return;

    setBuyingId(landId);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'buyLand',
      args: [landId],
      value: priceToSend,
    });
  };

  // After chain success: update govt + marketplace db
  useEffect(() => {
    const sync = async () => {
      if (!isSuccess || !buyingId || !userProfile) return;

      const profile = userProfile as readonly [string, string, boolean];
      const buyerCnic = String(profile?.[1] ?? '');
      if (!buyerCnic) return;

      try {
        const { error: govtError } = await supabase
          .from('govt_land_records')
          .update({ owner_cnic: buyerCnic })
          .eq('land_id', buyingId);
        if (govtError) throw govtError;

        const { error: marketError } = await marketDb
          .from('listings')
          .update({ status: 'sold' })
          .eq('land_id', buyingId);
        if (marketError) throw marketError;

        alert('Purchase successful! Ownership transferred and databases updated.');
        setBuyingId(null);
        void fetchListings();
      } catch (e) {
        console.error(e);
        alert('CRITICAL: Blockchain succeeded but database sync failed. Contact support with tx hash.');
      }
    };
    void sync();
  }, [isSuccess, buyingId, userProfile]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            Property Marketplace
          </h1>
          <p className="mt-2 text-sm text-white/60">
            Browse verified properties and purchase when listed on-chain.
          </p>
        </div>

        {writeError && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Transaction failed: {writeError.message.split('\n')[0]}
          </div>
        )}

        {listings.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-white/60">
            No active properties found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {listings.map((item) => (
              <div key={String(item.id)} className="glass-card rounded-2xl overflow-hidden">
                <div className="h-40 bg-black/30">
                  {item.photos?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`https://gateway.pinata.cloud/ipfs/${item.photos[0]}`}
                      className="h-full w-full object-cover"
                      alt=""
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                      No photo
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold">{item.location ?? 'Unknown location'}</div>
                      <div className="mt-1 text-[11px] text-white/60 font-mono">{item.land_id}</div>
                    </div>
                    <div className="text-[10px] rounded-full border border-white/10 bg-black/20 px-2 py-1 text-white/60">
                      {item.status === 'on_chain' ? 'On-chain' : 'Negotiating'}
                    </div>
                  </div>

                  {item.status === 'listed' ? (
                    <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[10px] text-white/50">Asking range</div>
                      <div className="mt-1 text-sm font-semibold text-yellow-200">
                        {item.price_min ?? '-'} - {item.price_max ?? '-'} ETH
                      </div>
                      {item.whatsapp ? (
                        <a
                          href={`https://wa.me/${item.whatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-green-600 py-2 text-sm font-bold hover:bg-green-700"
                        >
                          Negotiate on WhatsApp
                        </a>
                      ) : (
                        <div className="mt-3 text-[11px] text-white/50">
                          Seller contact not provided.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 p-3">
                      <div className="text-[10px] text-green-200/80">Final verified price</div>
                      <div className="mt-1 text-xl font-extrabold">
                        {item.final_price ?? '-'} ETH
                      </div>
                    </div>
                  )}

                  {item.status === 'on_chain' && (
                    <button
                      onClick={() =>
                        handleBuy(item.land_id, Number(item.final_price ?? 0), item.seller_wallet)
                      }
                      disabled={!!buyingId}
                      className="mt-4 w-full rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {buyingId === item.land_id && isWalletOpening
                        ? 'Check wallet…'
                        : buyingId === item.land_id && isConfirming
                          ? 'Processing…'
                          : 'Buy now'}
                    </button>
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

