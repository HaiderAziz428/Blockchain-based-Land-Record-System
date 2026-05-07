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

      <main className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10">
        <div className="mb-6 pb-4 border-b border-white/[0.06] flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Marketplace</h1>
            <p className="text-[11px] text-gray-500 mt-0.5">Listings live on-chain · photos &amp; metadata on IPFS · 7-day expiry</p>
          </div>
          <span className="text-[11px] text-gray-500">
            {!isLoading && <><span className="text-white font-medium">{items.length}</span> active</>}
          </span>
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
                <div key={item.land_id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden flex flex-col">
                  {/* Photo */}
                  <div className="h-40 bg-black/30 relative">
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
                        no photo
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex flex-col flex-1">
                    {/* Title + meta */}
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <div className="text-sm font-semibold truncate text-white">{item.location ?? 'Unknown location'}</div>
                      <span className="text-[10px] text-gray-500 font-mono shrink-0">{item.land_id}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500 mb-3">
                      {item.area_sq_yards && <span>{item.area_sq_yards} sq yd</span>}
                      {item.land_type && <span>· {item.land_type}</span>}
                      {item.deadline > 0 && (
                        <span className="text-yellow-400/70 flex items-center gap-1">
                          <Clock size={10} /> exp {new Date(item.deadline * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-gray-500 mb-4 line-clamp-2 leading-relaxed">{item.description}</p>
                    )}

                    {/* Price + IPFS row */}
                    <div className="flex items-baseline justify-between mb-3 mt-auto">
                      <div>
                        <div className="text-lg font-bold text-white leading-none">{priceEth} <span className="text-xs text-gray-400 font-medium">ETH</span></div>
                        <div className="text-[10px] text-gray-600 mt-1">on-chain verified</div>
                      </div>
                      <a
                        href={`${IPFS_GATEWAY}/${item.metadata_cid}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-gray-500 hover:text-indigo-300 flex items-center gap-0.5"
                      >
                        IPFS metadata <ExternalLink size={9} />
                      </a>
                    </div>

                    {/* Action */}
                    {isOwn ? (
                      <div className="w-full rounded-md bg-white/[0.04] border border-white/[0.06] py-2.5 text-center text-[11px] text-gray-500">
                        your listing
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={() => handleBuy(item.land_id, item.price, item.seller)}
                          disabled={!!buyingId}
                          className="w-full rounded-md bg-indigo-600 py-2.5 font-semibold text-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
                        >
                          {buyingId === item.land_id && isWalletOpening ? 'Check wallet…'
                            : buyingId === item.land_id && isConfirming ? 'Processing…'
                            : `Buy for ${priceEth} ETH`}
                        </button>
                        {item.whatsapp_contact && (
                          <a
                            href={`https://wa.me/${item.whatsapp_contact.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block w-full text-center text-[11px] text-gray-400 hover:text-white py-1.5 border border-white/10 rounded-md transition-colors"
                          >
                            Contact seller on WhatsApp
                          </a>
                        )}
                      </div>
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
