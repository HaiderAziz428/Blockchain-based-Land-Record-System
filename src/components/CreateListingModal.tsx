'use client';
import { useState, useEffect, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { X, UploadCloud, Loader2, CheckCircle2 } from 'lucide-react';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { uploadFileToIPFS, uploadJSONToIPFS } from '@/src/utils/pinata';

interface ListingLand {
  land_id: string;
  location: string;
  area_sq_yards?: number;
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
  const [landType, setLandType] = useState('Real Estate (House/Plot)');
  const [desc, setDesc] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [prepError, setPrepError] = useState('');
  const processedRef = useRef(false);

  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const reset = () => {
    setPrepStep('idle');
    setMetadataCid('');
    setPrice('');
    setLandType('Real Estate (House/Plot)');
    setDesc('');
    setWhatsapp('');
    setFiles(null);
    setPrepError('');
    processedRef.current = false;
  };

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen]);

  useEffect(() => {
    if (isSuccess && hash && !processedRef.current) {
      processedRef.current = true;
      onSuccess(hash);
      onClose();
    }
  }, [isSuccess, hash]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || !price || parseFloat(price) <= 0) return;
    setPrepError('');
    processedRef.current = false;

    // ── 1. Upload photos to IPFS (max 3) ─────────────────────────────────
    setPrepStep('uploading_photos');
    const photoHashes: string[] = [];
    const limit = Math.min(files.length, 3);
    for (let i = 0; i < limit; i++) {
      const photoCid = await uploadFileToIPFS(files[i], `Photo_${land.land_id}_${i + 1}`);
      if (photoCid) photoHashes.push(photoCid);
    }
    if (photoHashes.length === 0) {
      setPrepError('Photo upload failed. Check Pinata API keys.');
      setPrepStep('idle');
      return;
    }

    // ── 2. Build & pin listing metadata JSON ─────────────────────────────
    setPrepStep('uploading_metadata');
    const metadata = {
      name: `Listing – ${land.land_id}`,
      description: desc,
      land_id: land.land_id,
      location: land.location,
      area_sq_yards: land.area_sq_yards ?? null,
      land_type: landType,
      price_eth: parseFloat(price),
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

    // ── 3. Call listLandForSale on-chain with the IPFS CID ────────────────
    writeContract({
      address: CONTRACT_ADDRESS as `0x${string}`,
      abi: CONTRACT_ABI,
      functionName: 'listLandForSale',
      args: [land.land_id, parseEther(price), listingCid],
    });
  };

  const isIpfsBusy = prepStep === 'uploading_photos' || prepStep === 'uploading_metadata';
  const isTxBusy = isPending || isConfirming;
  const isBusy = isIpfsBusy || isTxBusy;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b1e]/80 backdrop-blur-md p-4">
      <div className="glass-card p-6 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative animate-[fadeUp_0.3s_ease]">
        <button onClick={onClose} disabled={isBusy} className="absolute top-4 right-4 text-white/50 hover:text-white disabled:opacity-30">
          <X size={20} />
        </button>

        <h2 className="text-lg font-semibold text-white tracking-tight">List for sale</h2>
        <p className="text-xs text-gray-500 mt-0.5 font-mono">
          {land.land_id} · {land.location}{land.area_sq_yards ? ` · ${land.area_sq_yards} sq yd` : ''}
        </p>
        <p className="text-[11px] text-gray-500 mt-3 mb-5 leading-relaxed">
          Photos &amp; metadata get pinned to IPFS, then price + CID are written on-chain. Listing is locked for 7 days.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Section: Listing details */}
          <fieldset className="space-y-3">
            <legend className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Listing details</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-400">Property type</label>
                <select value={landType} onChange={(e) => setLandType(e.target.value)} disabled={isBusy}
                  className="w-full bg-black/30 border border-white/10 p-2.5 rounded-md text-sm text-white outline-none mt-1 focus:border-indigo-500">
                  <option>Real Estate (House/Plot)</option>
                  <option>Agricultural Land</option>
                  <option>Commercial Property</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-gray-400">Sale price (ETH)</label>
                <input type="number" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)}
                  disabled={isBusy} placeholder="0.5"
                  className="w-full bg-black/30 border border-white/10 p-2.5 rounded-md text-sm text-white outline-none mt-1 font-mono focus:border-indigo-500"
                  required />
              </div>
            </div>
          </fieldset>

          {/* Section: Description */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Description</legend>
            <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={isBusy}
              className="w-full bg-black/30 border border-white/10 p-2.5 rounded-md text-sm text-white outline-none focus:border-indigo-500"
              placeholder="Corner plot, near park, all utilities available…" required />
          </fieldset>

          {/* Section: Buyer contact */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Buyer contact <span className="text-gray-600 normal-case font-normal">— optional, stored on IPFS</span></legend>
            <input type="text" placeholder="+92 300 0000000" value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)} disabled={isBusy}
              className="w-full bg-black/30 border border-white/10 p-2.5 rounded-md text-sm text-white outline-none focus:border-indigo-500" />
          </fieldset>

          {/* Section: Photos */}
          <fieldset>
            <legend className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">Photos <span className="text-gray-600 normal-case font-normal">— up to 3, pinned to IPFS</span></legend>
            <input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)}
              disabled={isBusy}
              className="w-full text-xs text-gray-400 file:bg-indigo-600 file:border-0 file:rounded-md file:px-3 file:py-1.5 file:text-white file:text-xs file:font-medium file:mr-3 file:cursor-pointer"
              required />
          </fieldset>

          {/* Plain status — replaces the styled pill list */}
          {(isBusy || metadataCid) && (
            <div className="text-xs text-gray-400 font-mono space-y-1 px-3 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-md">
              <div className="flex items-center gap-2">
                {isIpfsBusy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} className="text-green-400" />}
                <span>{prepStep === 'uploading_photos' ? 'Uploading photos…'
                  : prepStep === 'uploading_metadata' ? 'Pinning metadata JSON…'
                  : 'IPFS upload complete'}</span>
              </div>
              {(isPending || isConfirming || isSuccess) && (
                <div className="flex items-center gap-2">
                  {isSuccess ? <CheckCircle2 size={11} className="text-green-400" /> : <Loader2 size={11} className="animate-spin" />}
                  <span>{isPending ? 'Awaiting wallet signature…' : isConfirming ? 'Confirming on Sepolia…' : 'Listed on-chain'}</span>
                </div>
              )}
            </div>
          )}

          {prepError && (
            <div className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">{prepError}</div>
          )}
          {writeError && (
            <div className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {writeError.message.split('\n')[0]}
            </div>
          )}

          <button type="submit" disabled={isBusy}
            className="w-full bg-brand-primary hover:bg-indigo-500 py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2">
            {isBusy && <Loader2 size={16} className="animate-spin" />}
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
