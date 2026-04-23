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

const PREP_LABELS: Record<string, string> = {
  uploading_photos: 'Uploading photos to IPFS…',
  uploading_metadata: 'Pinning listing metadata to IPFS…',
};

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

        <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <UploadCloud className="text-brand-primary" /> List Property On-Chain
        </h2>
        <p className="text-xs text-gray-500 mb-3 font-mono">
          {land.land_id} · {land.location}{land.area_sq_yards ? ` · ${land.area_sq_yards} Sq Yds` : ''}
        </p>
        <div className="mb-5 text-[11px] text-white/40 bg-white/[0.02] border border-white/[0.06] rounded-lg px-3 py-2">
          Fully decentralized — photos and metadata are pinned to IPFS, the CID and price are stored on-chain. No database involved.
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/60">Property Type</label>
              <select value={landType} onChange={(e) => setLandType(e.target.value)} disabled={isBusy}
                className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none mt-1">
                <option>Real Estate (House/Plot)</option>
                <option>Agricultural Land</option>
                <option>Commercial Property</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-white/60">Sale Price (ETH) — locked on-chain</label>
              <input type="number" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)}
                disabled={isBusy} placeholder="e.g. 0.5"
                className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none mt-1 font-mono"
                required />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-white/60">WhatsApp (optional — stored in IPFS metadata)</label>
              <input type="text" placeholder="+92 300 0000000" value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)} disabled={isBusy}
                className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none mt-1" />
            </div>
          </div>

          <div>
            <label className="text-xs text-white/60">Description</label>
            <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={isBusy}
              className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white outline-none mt-1"
              placeholder="e.g. Corner plot, near park, all utilities available…" required />
          </div>

          <div>
            <label className="text-xs text-white/60">Photos — max 3, pinned to IPFS</label>
            <input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)}
              disabled={isBusy}
              className="w-full mt-1 text-sm text-white/60 file:bg-brand-primary file:border-0 file:rounded-xl file:px-4 file:py-2 file:text-white"
              required />
          </div>

          {/* IPFS + blockchain progress pipeline */}
          {(isBusy || metadataCid) && (
            <div className="space-y-2">
              {(['uploading_photos', 'uploading_metadata'] as const).map((s) => {
                const prepSteps = ['uploading_photos', 'uploading_metadata'] as const;
                const curIdx = prepSteps.indexOf(prepStep as typeof prepSteps[number]);
                const thisIdx = prepSteps.indexOf(s);
                const isDone = prepStep === 'ready' || isTxBusy || curIdx > thisIdx;
                const isActive = prepStep === s;
                return (
                  <div key={s} className={`flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg transition-all ${
                    isDone ? 'text-green-400 bg-green-500/10' :
                    isActive ? 'text-indigo-300 bg-indigo-500/10' :
                    'text-gray-600 bg-white/[0.02]'
                  }`}>
                    {isDone ? <CheckCircle2 size={13} /> : isActive ? <Loader2 size={13} className="animate-spin" /> : <div className="w-[13px] h-[13px] rounded-full border border-current opacity-30" />}
                    {PREP_LABELS[s]}
                  </div>
                );
              })}
              {[
                { key: 'wallet', label: 'Waiting for wallet approval…', active: isPending, done: isConfirming || isSuccess },
                { key: 'chain', label: 'Confirming on Sepolia…', active: isConfirming, done: !!isSuccess },
              ].map(({ key, label, active, done }) => (
                <div key={key} className={`flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg transition-all ${
                  done ? 'text-green-400 bg-green-500/10' :
                  active ? 'text-indigo-300 bg-indigo-500/10' :
                  'text-gray-600 bg-white/[0.02]'
                }`}>
                  {done ? <CheckCircle2 size={13} /> : active ? <Loader2 size={13} className="animate-spin" /> : <div className="w-[13px] h-[13px] rounded-full border border-current opacity-30" />}
                  {label}
                </div>
              ))}
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
