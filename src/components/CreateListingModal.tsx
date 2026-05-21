'use client';
import { useState, useEffect, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import { uploadFileToIPFS, uploadJSONToIPFS } from '@/src/utils/pinata';
import { formatBps } from '@/src/utils/roleConstants';

interface ListingLand {
  land_id: string;
  location?: string;
  area_sq_yards?: number;
  currentShareBps: number;
}

interface CreateListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  land: ListingLand;
  sellerAddress: string;
  onSuccess: (txHash: string) => void;
}

type PrepStep = 'idle' | 'uploading_photos' | 'uploading_metadata' | 'ready';

export default function CreateListingModal({ isOpen, onClose, land, sellerAddress, onSuccess }: CreateListingModalProps) {
  const [prepStep, setPrepStep] = useState<PrepStep>('idle');
  const [metadataCid, setMetadataCid] = useState('');
  const [price, setPrice] = useState('');
  const [shareBps, setShareBps] = useState('');
  const [desc, setDesc] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [prepError, setPrepError] = useState('');
  const processedRef = useRef(false);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const reset = () => {
    setPrepStep('idle'); setMetadataCid(''); setPrice(''); setShareBps('');
    setDesc(''); setWhatsapp(''); setFiles(null); setPrepError('');
    processedRef.current = false;
  };

  useEffect(() => { if (!isOpen) reset(); }, [isOpen]);

  useEffect(() => {
    if (isSuccess && hash && !processedRef.current) {
      processedRef.current = true;
      onSuccess(hash);
      onClose();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, hash]); // onClose/onSuccess are stable parent callbacks

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || !price || parseFloat(price) <= 0) return;

    const bps = parseInt(shareBps, 10);
    if (!bps || bps <= 0 || bps > land.currentShareBps) {
      setPrepError(`Share must be 1–${land.currentShareBps} bps.`);
      return;
    }

    setPrepError('');
    processedRef.current = false;

    try {
      setPrepStep('uploading_photos');
      const photoHashes: string[] = [];
      const limit = Math.min(files.length, 3);
      for (let i = 0; i < limit; i++) {
        const photoCid = await uploadFileToIPFS(files[i], `Photo_${land.land_id}_${i + 1}`);
        if (photoCid) photoHashes.push(photoCid);
      }
      if (photoHashes.length === 0) {
        setPrepError('No photos were pinned. Add at least one photo and retry.');
        setPrepStep('idle');
        return;
      }

      setPrepStep('uploading_metadata');
      const metadata = {
        name: `Listing – ${land.land_id}`,
        description: desc,
        land_id: land.land_id,
        location: land.location ?? '',
        area_sq_yards: land.area_sq_yards ?? null,
        share_bps: bps,
        share_pct: formatBps(bps),
        price_eth: parseFloat(price),
        seller: sellerAddress,
        whatsapp_contact: whatsapp || null,
        photos: photoHashes.map((h) => `ipfs://${h}`),
      };
      const listingCid = await uploadJSONToIPFS(metadata, `Listing_${land.land_id}`);
      if (!listingCid) {
        setPrepError('Metadata pinning to IPFS failed.');
        setPrepStep('idle');
        return;
      }
      setMetadataCid(listingCid);
      setPrepStep('ready');

      writeContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'listShareForSale',
        args: [land.land_id, bps, parseEther(price), listingCid],
      });
    } catch (err) {
      setPrepError((err as Error).message);
      setPrepStep('idle');
    }
  };

  const isIpfsBusy = prepStep === 'uploading_photos' || prepStep === 'uploading_metadata';
  const isTxBusy = isPending || isConfirming;
  const isBusy = isIpfsBusy || isTxBusy;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
      <div className="glass-card p-6 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-[fadeUp_0.3s_ease]">
        <button
          onClick={onClose}
          disabled={isBusy}
          className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors disabled:opacity-30"
        >
          <X size={18} />
        </button>

        <h2 className="text-base font-semibold text-foreground tracking-tight">List share for sale</h2>
        <p className="text-xs text-muted mt-0.5 font-mono">
          {land.land_id}
          {land.location ? ` · ${land.location}` : ''}
          {land.area_sq_yards ? ` · ${land.area_sq_yards} sq yd` : ''}
        </p>
        <p className="text-[11px] text-muted mt-1">
          Your balance: <span className="text-accent">{formatBps(land.currentShareBps)}</span> ({land.currentShareBps} bps)
        </p>
        <p className="text-[11px] text-muted mt-3 mb-5 leading-relaxed">
          Photos &amp; metadata get pinned to IPFS, then the share bps + price + CID are written on-chain. Listing lasts 7 days.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="text-[11px] uppercase tracking-wide text-muted mb-2">Listing details</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted">Share to sell (bps, max {land.currentShareBps})</label>
                <input
                  type="number"
                  min="1"
                  max={land.currentShareBps}
                  value={shareBps}
                  onChange={(e) => setShareBps(e.target.value)}
                  disabled={isBusy}
                  placeholder={`${land.currentShareBps}`}
                  className="field mt-1 font-mono"
                  required
                />
                {shareBps && (
                  <p className="text-[10px] text-muted mt-0.5">= {formatBps(parseInt(shareBps) || 0)}</p>
                )}
              </div>
              <div>
                <label className="text-[11px] text-muted">Sale price (ETH)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={isBusy}
                  placeholder="0.5"
                  className="field mt-1 font-mono"
                  required
                />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-muted mb-2">Description</legend>
            <textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              disabled={isBusy}
              className="field"
              placeholder="Corner plot, near park, all utilities available…"
              required
            />
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-muted mb-2">
              Buyer contact <span className="text-muted-foreground normal-case font-normal">— optional, stored on IPFS</span>
            </legend>
            <input
              type="text"
              placeholder="+92 300 0000000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              disabled={isBusy}
              className="field"
            />
          </fieldset>

          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-muted mb-2">
              Photos <span className="text-muted-foreground normal-case font-normal">— up to 3, pinned to IPFS</span>
            </legend>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => setFiles(e.target.files)}
              disabled={isBusy}
              className="w-full text-xs text-muted file:bg-accent file:border-0 file:rounded-md file:px-3 file:py-1.5 file:text-white file:text-xs file:font-medium file:mr-3 file:cursor-pointer"
              required
            />
          </fieldset>

          {(isBusy || metadataCid) && (
            <div className="text-xs text-muted font-mono space-y-1 px-3 py-2.5 bg-surface-elevated border border-border rounded-lg">
              <div className="flex items-center gap-2">
                {isIpfsBusy
                  ? <Loader2 size={11} className="animate-spin" />
                  : <CheckCircle2 size={11} className="text-success" />}
                <span>
                  {prepStep === 'uploading_photos' ? 'Uploading photos…'
                    : prepStep === 'uploading_metadata' ? 'Pinning metadata JSON…'
                    : 'IPFS upload complete'}
                </span>
              </div>
              {(isPending || isConfirming || isSuccess) && (
                <div className="flex items-center gap-2">
                  {isSuccess
                    ? <CheckCircle2 size={11} className="text-success" />
                    : <Loader2 size={11} className="animate-spin" />}
                  <span>
                    {isPending ? 'Awaiting wallet signature…' : isConfirming ? 'Confirming on Sepolia…' : 'Listed on-chain'}
                  </span>
                </div>
              )}
            </div>
          )}

          {prepError && (
            <div className="text-danger text-xs p-3 bg-danger/10 rounded-lg border border-danger/20">{prepError}</div>
          )}
          {writeError && (
            <div className="text-danger text-xs p-3 bg-danger/10 rounded-lg border border-danger/20">
              {writeError.message.split('\n')[0]}
            </div>
          )}

          <button
            type="submit"
            disabled={isBusy}
            className="btn-primary w-full py-3 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {isBusy && <Loader2 size={15} className="animate-spin" />}
            {isPending ? 'Confirm in wallet…'
              : isConfirming ? 'Confirming on-chain…'
              : isIpfsBusy ? 'Uploading to IPFS…'
              : 'Upload to IPFS & List On-Chain'}
          </button>
        </form>
      </div>
    </div>
  );
}
