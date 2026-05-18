'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import Navbar from '@/src/components/Navbar';
import TxToast from '@/src/components/TxToast';
import { Loader2, Clock, ExternalLink, ShoppingCart, AlertCircle } from 'lucide-react';
import {
  CONTRACT_V9_ABI,
  CONTRACT_V9_ADDRESS,
  LandStatusV9,
  LandTypeV9,
  landTypeLabel,
  formatBps,
} from '@/src/utils/contractV9';
import { supabase } from '@/src/lib/supabase';

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs',
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
];

async function fetchIpfs(cid: string): Promise<Response> {
  for (const gw of IPFS_GATEWAYS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(`${gw}/${cid}`, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) return res;
    } catch { clearTimeout(t); }
  }
  throw new Error('All IPFS gateways failed');
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Listing = {
  shareBpsForSale: number;
  price: bigint;
  seller: string;
  isActive: boolean;
  deadline: bigint;
  metadataHash: string;
};

type MarketItem = {
  landId: string;
  landType: number;
  listing: Listing;
  // hydrated from IPFS
  description?: string;
  photos?: string[];
  location?: string;
  area_sq_yards?: number;
  whatsapp_contact?: string;
};

// ─── Main ────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [items, setItems] = useState<MarketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingKey, setBuyingKey] = useState<string | null>(null); // `${landId}-${seller}`
  const [txToast, setTxToast] = useState<{ hash: string; message: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── User profile (check registration) ─────────────────────────────────────
  const { data: userProfile } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'getUser',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const profile = userProfile as { name: string; cnic: string; isRegistered: boolean } | undefined;

  // ── Buy share ─────────────────────────────────────────────────────────────
  const buyProcessedRef = useRef(false);
  const [pendingBuyItem, setPendingBuyItem] = useState<MarketItem | null>(null);

  const { writeContract, data: buyHash, isPending: isBuyPending, error: buyError } = useWriteContract();
  const { isLoading: isBuyConfirming, isSuccess: isBuySuccess } = useWaitForTransactionReceipt({ hash: buyHash });

  useEffect(() => {
    if (isBuySuccess && buyHash && !buyProcessedRef.current) {
      buyProcessedRef.current = true;
      setTxToast({ hash: buyHash, message: 'Share purchased successfully!' });
      // Sync Supabase owner_cnic best-effort
      if (pendingBuyItem && profile?.cnic) {
        void supabase
          .from('govt_land_records')
          .update({ owner_cnic: profile.cnic })
          .eq('land_id', pendingBuyItem.landId);
      }
      setBuyingKey(null);
      setPendingBuyItem(null);
      fetchListings();
    }
  }, [isBuySuccess, buyHash]);

  // ── Load listings ─────────────────────────────────────────────────────────

  const fetchListings = async () => {
    if (!publicClient) return;
    setIsLoading(true);
    try {
      // 1. Get all land records (paginated, 200 cap)
      const result = (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getAllLandRecordsPaginated',
        args: [BigInt(0), BigInt(200)],
      })) as unknown as [{ landId: string; landType: number; status: number }[], bigint];

      const lands = result[0].filter((l) => l.status === LandStatusV9.ACTIVE);

      // 2. Collect unique seller addresses from ShareListed events.
      //    NOTE: landId is an indexed string in the event — Solidity stores only its
      //    keccak256 hash in the topic, so log.args.landId is always undefined. We can
      //    only recover the seller (address, fixed-size, fully decodable). We then try
      //    getListing(landId, seller) for every active land × known seller below.
      const allSellers = new Set<string>();
      try {
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock = latestBlock > BigInt(9000) ? latestBlock - BigInt(9000) : BigInt(0);

        const logs = await publicClient.getLogs({
          address: CONTRACT_V9_ADDRESS,
          event: {
            name: 'ShareListed',
            type: 'event',
            inputs: [
              { indexed: true, name: 'landId', type: 'string' },
              { indexed: true, name: 'seller', type: 'address' },
              { indexed: false, name: 'shareBpsForSale', type: 'uint16' },
              { indexed: false, name: 'price', type: 'uint256' },
              { indexed: false, name: 'metadataHash', type: 'string' },
            ],
          },
          fromBlock,
          toBlock: 'latest',
        });

        for (const log of logs) {
          const seller = (log.args as { seller?: string }).seller ?? '';
          if (seller) allSellers.add(seller.toLowerCase());
        }
      } catch {
        // RPC event range limited — fallback: no sellers from events
      }

      // 3. For each active land × each known seller, call getListing.
      //    getListing returns an empty/inactive struct for combinations that don't exist,
      //    so the isActive check below filters those out cheaply.
      const marketItems: MarketItem[] = [];
      await Promise.all(
        lands.map(async (land) => {
          await Promise.all(
            Array.from(allSellers).map(async (seller) => {
              try {
                const listing = (await publicClient.readContract({
                  address: CONTRACT_V9_ADDRESS,
                  abi: CONTRACT_V9_ABI,
                  functionName: 'getListing',
                  args: [land.landId, seller as `0x${string}`],
                })) as Listing;

                if (!listing.isActive || !listing.metadataHash) return;

                const now = BigInt(Math.floor(Date.now() / 1000));
                if (listing.deadline < now) return; // expired

                const item: MarketItem = {
                  landId: land.landId,
                  landType: land.landType,
                  listing,
                };

                // Hydrate from IPFS
                try {
                  const res = await fetchIpfs(listing.metadataHash);
                  if (res.ok) {
                    const meta = await res.json();
                    item.description = meta.description;
                    item.photos = meta.photos?.map((p: string) => p.replace('ipfs://', ''));
                    item.location = meta.location;
                    item.area_sq_yards = meta.area_sq_yards;
                    item.whatsapp_contact = meta.whatsapp_contact;
                  }
                } catch {
                  // IPFS fetch failed — show card without metadata
                }

                marketItems.push(item);
              } catch {
                // Listing read failed
              }
            })
          );
        })
      );

      // Sort by price ascending
      marketItems.sort((a, b) =>
        a.listing.price < b.listing.price ? -1 : a.listing.price > b.listing.price ? 1 : 0
      );

      setItems(marketItems);
    } catch (e) {
      console.error('fetchListings error:', e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (mounted) fetchListings();
  }, [mounted, publicClient]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!mounted) return null;

  const handleBuy = (item: MarketItem) => {
    if (!isConnected) { setNotice('Connect your wallet to buy.'); return; }
    if (!profile?.isRegistered) { setNotice('You must register in the User Portal before buying.'); return; }
    if (item.listing.seller.toLowerCase() === address?.toLowerCase()) { setNotice('You cannot buy your own listing.'); return; }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (item.listing.deadline < now) { setNotice('This listing has expired.'); return; }

    buyProcessedRef.current = false;
    setPendingBuyItem(item);
    const key = `${item.landId}-${item.listing.seller}`;
    setBuyingKey(key);

    writeContract({
      address: CONTRACT_V9_ADDRESS,
      abi: CONTRACT_V9_ABI,
      functionName: 'buyShare',
      args: [item.landId, item.listing.seller as `0x${string}`, item.listing.price],
      value: item.listing.price,
    });
  };

  return (
    <main className="min-h-screen bg-brand-dark text-white">
      <Navbar />

      {txToast && (
        <TxToast txHash={txToast.hash} message={txToast.message} onDismiss={() => setTxToast(null)} />
      )}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Land Share Marketplace</h1>
          <p className="text-white/50 text-sm mt-1">
            Browse fractional land share listings. Prices and ownership are fully on-chain.
          </p>
        </div>

        {notice && (
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-yellow-500/10 border-yellow-500/20 text-yellow-300 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="ml-auto text-white/40 hover:text-white">×</button>
          </div>
        )}

        {buyError && (
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-red-500/10 border-red-500/20 text-red-300 text-sm">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{buyError.message.split('\n')[0]}</span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-white/40 py-12 justify-center">
            <Loader2 size={20} className="animate-spin" />
            Loading marketplace…
          </div>
        ) : items.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center text-white/40">
            No active share listings found. Check back later.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {items.map((item) => {
              const key = `${item.landId}-${item.listing.seller}`;
              const isBuying = buyingKey === key && (isBuyPending || isBuyConfirming);
              const deadline = new Date(Number(item.listing.deadline) * 1000);
              const isExpired = item.listing.deadline < BigInt(Math.floor(Date.now() / 1000));

              return (
                <div key={key} className="glass-card rounded-2xl overflow-hidden flex flex-col">
                  {/* Photo */}
                  {item.photos && item.photos.length > 0 ? (
                    <div className="relative h-44 bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${IPFS_GATEWAYS[0]}/${item.photos[0]}`}
                        alt={item.landId}
                        className="w-full h-full object-cover opacity-80"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div className="h-32 bg-white/[0.03] flex items-center justify-center text-white/10 text-xs">
                      No photos
                    </div>
                  )}

                  {/* Body */}
                  <div className="p-5 flex-1 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm text-indigo-400">{item.landId}</p>
                        <p className="text-xs text-white/40 mt-0.5">{landTypeLabel(item.landType as LandTypeV9)}</p>
                        {item.location && (
                          <p className="text-xs text-white/50 mt-0.5">{item.location}</p>
                        )}
                      </div>
                      <span className="pill border bg-indigo-500/10 text-indigo-400 border-indigo-500/20 whitespace-nowrap">
                        {formatBps(item.listing.shareBpsForSale)}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-xs text-white/60 line-clamp-2">{item.description}</p>
                    )}

                    <div className="text-xs text-white/40 flex items-center gap-1">
                      <Clock size={11} />
                      {isExpired ? (
                        <span className="text-red-400">Expired</span>
                      ) : (
                        `Expires ${deadline.toLocaleDateString()}`
                      )}
                    </div>

                    <div className="text-xs text-white/40 font-mono truncate">
                      Seller: {item.listing.seller.slice(0, 8)}…{item.listing.seller.slice(-6)}
                    </div>

                    {item.listing.metadataHash && (
                      <a
                        href={`${IPFS_GATEWAYS[0]}/${item.listing.metadataHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-white/30 hover:text-indigo-400"
                      >
                        <ExternalLink size={10} /> IPFS metadata
                      </a>
                    )}

                    {item.whatsapp_contact && (
                      <a
                        href={`https://wa.me/${item.whatsapp_contact.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-green-400 hover:underline"
                      >
                        WhatsApp: {item.whatsapp_contact}
                      </a>
                    )}

                    <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
                      <div>
                        <p className="text-white font-bold text-lg">
                          {formatEther(item.listing.price)} ETH
                        </p>
                        <p className="text-xs text-white/30">
                          {item.area_sq_yards ? `${item.area_sq_yards} sq yd` : ''}
                        </p>
                      </div>
                      <button
                        onClick={() => handleBuy(item)}
                        disabled={isBuying || isExpired}
                        className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {isBuying ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ShoppingCart size={14} />
                        )}
                        {isBuying
                          ? isBuyPending
                            ? 'Confirm…'
                            : 'Buying…'
                          : 'Buy Share'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
