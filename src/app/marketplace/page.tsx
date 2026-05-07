'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import Navbar from '@/src/components/Navbar';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { Loader2, Clock, ExternalLink } from 'lucide-react';
import TxToast from '@/src/components/TxToast';

const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs';

// Tuple returned by the landListings(landId) getter
type OnChainListing = [bigint, string, boolean, bigint, string]; // price, seller, isActive, deadline, metadataHash

type MarketItem = {
  land_id: string;
  price: bigint;
  seller: string;
  deadline: number;
  metadata_cid: string;
  // Hydrated from IPFS metadata JSON
  location?: string;
  area_sq_yards?: number;
  land_type?: string;
  description?: string;
  photos?: string[]; // raw IPFS CIDs (ipfs:// prefix stripped)
  whatsapp_contact?: string;
};

function DeadlineBadge({ deadline }: { deadline: number }) {
  const label = new Date(deadline * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <span className="text-[10px] text-yellow-400/80 flex items-center gap-1">
      <Clock size={10} /> Expires {label}
    </span>
  );
}

export default function MarketplacePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [items, setItems] = useState<MarketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [txToast, setTxToast] = useState<{ hash: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    if (!publicClient) return;
    setIsLoading(true);
    try {
      // 1. Pull all land records from the contract (200 cap is plenty for FYP demo)
      const result = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getAllLandRecordsPaginated',
        args: [BigInt(0), BigInt(200)],
      }) as unknown as [{ landId: string; status: number }[], bigint];
      const lands = result[0];

      // 2. Check each land for an active on-chain listing, then hydrate from IPFS
      const settled = await Promise.all(
        lands.map(async (land): Promise<MarketItem | null> => {
          if (Number(land.status) !== 0) return null; // skip locked / inheritance-pending lands
          try {
            const listing = await publicClient.readContract({
              address: CONTRACT_ADDRESS,
              abi: CONTRACT_ABI,
              functionName: 'landListings',
              args: [land.landId],
            }) as OnChainListing;

            const [price, seller, isActive, deadline, metadataCid] = listing;
            if (!isActive || !metadataCid) return null;

            // 3. Fetch listing metadata JSON from IPFS
            let meta: Record<string, unknown> = {};
            try {
              const res = await fetch(`${IPFS_GATEWAY}/${metadataCid}`, {
                signal: AbortSignal.timeout(8000),
              });
              if (res.ok) meta = await res.json();
            } catch { /* show listing card even if IPFS is momentarily slow */ }

            const rawPhotos = (meta.photos as string[] | undefined) ?? [];
            const photos = rawPhotos.map((p) => (p.startsWith('ipfs://') ? p.slice(7) : p));

            return {
              land_id: land.landId,
              price,
              seller,
              deadline: Number(deadline),
              metadata_cid: metadataCid,
              location: meta.location as string | undefined,
              area_sq_yards: meta.area_sq_yards as number | undefined,
              land_type: meta.land_type as string | undefined,
              description: meta.description as string | undefined,
              photos,
              whatsapp_contact: meta.whatsapp_contact as string | undefined,
            };
          } catch {
            return null;
          }
        })
      );

      setItems(settled.filter((i): i is MarketItem => i !== null));
    } catch (e) {
      console.error('Failed to fetch on-chain listings:', e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (publicClient) void fetchListings();
  }, [publicClient]);

  useEffect(() => {
    if (isSuccess) void fetchListings();
  }, [isSuccess]);

  const handleBuy = async (landId: string, priceWei: bigint, sellerWallet: string) => {
    if (!isConnected || !address || !publicClient) {
      setNotice('Connect your wallet to buy land.');
      return;
    }
    if (sellerWallet.toLowerCase() === address.toLowerCase()) {
      setNotice('You are the seller — cannot buy your own listing.');
      return;
    }

    const profile = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'users',
      args: [address],
    })) as [string, string, boolean];
    if (!profile[2]) {
      setNotice('Your wallet is not registered. Open the User Portal to complete one-time CNIC verification first.');
      return;
    }

    // Re-read listing on-chain for freshest price + expiry check
    const listing = (await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'landListings',
      args: [landId],
    })) as OnChainListing;
    const [onChainPrice, , isActive, deadline] = listing;

    if (!isActive) { setNotice('This listing is no longer active. Refresh the page.'); return; }
    if (deadline > BigInt(0) && BigInt(Math.floor(Date.now() / 1000)) > deadline) {
      setNotice('Listing has expired (7-day window) — the seller must relist.');
      return;
    }
    setNotice(null);

    const priceEth = Number(onChainPrice) / 1e18;
    if (!confirm(`Buy Land ${landId} for ${priceEth} ETH?`)) return;

    setBuyingId(landId);
    writeContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'buyLand',
      args: [landId],
      value: onChainPrice,
    });
  };

  // After a successful buy: sync ownership in the govt DB (the only DB we keep)
  useEffect(() => {
    const handleSuccess = async () => {
      if (!isSuccess || !buyingId || !hash || !userProfile) return;
      const profile = userProfile as readonly [string, string, boolean];
      const buyerCnic = String(profile[1] ?? '');
      if (buyerCnic) {
        try {
          const { supabase } = await import('@/src/lib/supabase');
          await supabase
            .from('govt_land_records')
            .update({ owner_cnic: buyerCnic })
            .eq('land_id', buyingId);
        } catch (e) {
          console.error('Govt DB ownership sync failed (non-critical):', e);
        }
      }
      setBuyingId(null);
      setTxToast({ hash, message: 'Purchase confirmed! NFT transferred to your wallet.' });
      void fetchListings();
    };
    void handleSuccess();
  }, [isSuccess, buyingId, hash, userProfile]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Property Marketplace</h1>
          <p className="mt-2 text-sm text-white/60">
            Fully on-chain listings — metadata and photos live on IPFS, price and ownership verified on Sepolia.
          </p>
        </div>

        {notice && (
          <div className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-sm text-yellow-100 flex items-start justify-between gap-3">
            <span>{notice}</span>
            <button
              onClick={() => setNotice(null)}
              className="text-yellow-300/60 hover:text-yellow-200 text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {writeError && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Transaction failed: {writeError.message.split('\n')[0]}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <Loader2 className="animate-spin" size={24} />
            <span>Reading listings from blockchain…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center text-white/60">
            No active on-chain listings found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {items.map((item) => {
              const priceEth = (Number(item.price) / 1e18).toFixed(4).replace(/\.?0+$/, '');
              const firstPhoto = item.photos?.[0];
              const isOwn = item.seller.toLowerCase() === address?.toLowerCase();

              return (
                <div key={item.land_id} className="glass-card rounded-2xl overflow-hidden">
                  {/* Photo */}
                  <div className="h-44 bg-black/30 relative">
                    {firstPhoto ? (
                      <Image
                        src={`${IPFS_GATEWAY}/${firstPhoto}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                        alt={item.location ?? 'Property photo'}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-white/30">
                        No photo
                      </div>
                    )}
                  </div>

                  <div className="p-5">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">{item.location ?? 'Unknown location'}</div>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {item.area_sq_yards && (
                            <span className="text-[10px] text-white/50">{item.area_sq_yards} Sq Yds</span>
                          )}
                          {item.land_type && (
                            <span className="text-[10px] text-white/40">· {item.land_type}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-white/50 font-mono mt-1">{item.land_id}</div>
                      </div>
                      <div className="text-right space-y-1 flex-shrink-0">
                        {item.deadline > 0 && <DeadlineBadge deadline={item.deadline} />}
                        <a
                          href={`${IPFS_GATEWAY}/${item.metadata_cid}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-indigo-400/70 hover:text-indigo-300 flex items-center gap-0.5 justify-end"
                        >
                          <ExternalLink size={9} /> IPFS
                        </a>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-white/40 mb-3 line-clamp-2">{item.description}</p>
                    )}

                    {/* Price */}
                    <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 mb-3">
                      <div className="text-[10px] text-green-200/80">On-chain verified price</div>
                      <div className="text-xl font-extrabold mt-0.5">{priceEth} ETH</div>
                    </div>

                    {/* WhatsApp */}
                    {item.whatsapp_contact && (
                      <a
                        href={`https://wa.me/${item.whatsapp_contact.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-3 flex w-full items-center justify-center rounded-xl bg-green-700/60 py-2 text-sm font-semibold hover:bg-green-700 transition-colors"
                      >
                        Contact Seller on WhatsApp
                      </a>
                    )}

                    {/* Action */}
                    {isOwn ? (
                      <div className="w-full rounded-xl bg-white/[0.04] border border-white/[0.06] py-3 text-center text-xs text-white/40">
                        Your listing
                      </div>
                    ) : (
                      <button
                        onClick={() => handleBuy(item.land_id, item.price, item.seller)}
                        disabled={!!buyingId}
                        className="w-full rounded-xl bg-indigo-600 py-3 font-bold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                      >
                        {buyingId === item.land_id && isWalletOpening ? 'Check wallet…'
                          : buyingId === item.land_id && isConfirming ? 'Processing…'
                          : 'Buy Now'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {txToast && (
        <TxToast txHash={txToast.hash} message={txToast.message} onDismiss={() => setTxToast(null)} />
      )}
    </div>
  );
}
