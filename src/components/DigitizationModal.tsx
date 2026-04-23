'use client';
import { useState } from 'react';
import { FileText, UploadCloud, Loader2, CheckCircle2, X } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { uploadFileToIPFS, uploadJSONToIPFS } from '@/src/utils/pinata';

interface DigitizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  landId: string;
  onSuccess: () => void;
}

type Step = 'idle' | 'uploading_doc' | 'building_metadata' | 'saving' | 'done' | 'error';

const STEP_LABELS: Record<string, string> = {
  uploading_doc: 'Uploading document to IPFS…',
  building_metadata: 'Pinning ERC-721 metadata to IPFS…',
  saving: 'Linking metadata hash to government record…',
};

const ORDERED_STEPS = ['uploading_doc', 'building_metadata', 'saving'] as const;

export default function DigitizationModal({ isOpen, onClose, landId, onSuccess }: DigitizationModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [metadataCid, setMetadataCid] = useState('');

  const reset = () => {
    setFile(null);
    setStep('idle');
    setErrorMsg('');
    setMetadataCid('');
  };

  const handleUpload = async () => {
    if (!file || !landId) return;
    setErrorMsg('');

    // ── Step 1: Upload physical document to IPFS ──────────────────────────
    setStep('uploading_doc');
    const docCid = await uploadFileToIPFS(file, `LandDoc_${landId}`);
    if (!docCid) {
      setErrorMsg('Document upload to IPFS failed. Check your Pinata API keys and internet connection.');
      setStep('error');
      return;
    }

    // ── Step 2: Fetch land details & build ERC-721 metadata JSON ──────────
    setStep('building_metadata');
    const { data: land } = await supabase
      .from('govt_land_records')
      .select('location, area_sq_yards, land_type, owner_cnic')
      .eq('land_id', landId)
      .single();

    const metadata = {
      name: `Land Record – ${landId}`,
      description: `Government-verified land record for ${land?.location ?? 'N/A'}.`,
      // ERC-721 standard: `image` points to the primary visual (survey map / document scan)
      image: `ipfs://${docCid}`,
      external_url: `https://paklr.vercel.app/land/${landId}`,
      attributes: [
        { trait_type: 'Land ID', value: landId },
        { trait_type: 'Location', value: land?.location ?? 'N/A' },
        { trait_type: 'Area (Sq Yards)', value: String(land?.area_sq_yards ?? 'N/A') },
        { trait_type: 'Land Type', value: land?.land_type ?? 'N/A' },
        { trait_type: 'Owner CNIC', value: land?.owner_cnic ?? 'N/A' },
      ],
      // Full document reference — links back to the raw file on IPFS
      documents: [
        { name: file.name, mime_type: file.type, ipfs_url: `ipfs://${docCid}` },
      ],
    };

    const cidResult = await uploadJSONToIPFS(metadata, `LandMetadata_${landId}`);
    if (!cidResult) {
      setErrorMsg('Metadata pinning to IPFS failed.');
      setStep('error');
      return;
    }
    setMetadataCid(cidResult);

    // ── Step 3: Store metadata CID in govt_land_records.ipfs_hash ─────────
    // This CID is what /api/verify will read and put on-chain via storeVerifiedLandRecord()
    setStep('saving');
    const { error } = await supabase
      .from('govt_land_records')
      .update({ ipfs_hash: cidResult })
      .eq('land_id', landId);

    if (error) {
      setErrorMsg(`Database update failed: ${error.message}`);
      setStep('error');
      return;
    }

    setStep('done');
    setTimeout(() => {
      onSuccess();
      onClose();
      reset();
    }, 1800);
  };

  const isProcessing = ['uploading_doc', 'building_metadata', 'saving'].includes(step);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0b1e]/80 backdrop-blur-md p-4">
      <div className="glass-card p-8 rounded-3xl w-full max-w-md relative animate-[fadeUp_0.3s_ease]">
        <button
          onClick={() => { if (!isProcessing) { reset(); onClose(); } }}
          className="absolute top-4 right-4 text-white/50 hover:text-white disabled:opacity-30"
          disabled={isProcessing}
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <FileText className="text-indigo-400" size={22} /> Request Digitization
        </h2>
        <p className="text-gray-500 text-xs mb-1 font-mono">Land ID: {landId}</p>
        <p className="text-gray-500 mb-6 text-sm">
          Upload your official Sale Deed, Fard, or Survey Map. The document is permanently pinned to IPFS and its metadata CID is linked to your land record — ready to be minted on-chain.
        </p>

        <div className="space-y-4">
          {/* File picker */}
          <label className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer block ${
            file
              ? 'border-indigo-500/60 bg-indigo-500/5'
              : 'border-white/10 hover:border-indigo-500/40'
          } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
            <UploadCloud size={28} className={`mx-auto mb-2 ${file ? 'text-indigo-400' : 'text-gray-500'}`} />
            <p className="text-xs text-gray-400 mb-2">PDF · PNG · JPG up to 20 MB</p>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setStep('idle'); setErrorMsg(''); }}
              className="hidden"
              disabled={isProcessing}
            />
            {file ? (
              <p className="text-sm text-indigo-300 font-medium truncate">{file.name}</p>
            ) : (
              <p className="text-sm text-gray-500">Click to select document</p>
            )}
          </label>

          {/* Progress steps */}
          {(isProcessing || step === 'done') && (
            <div className="space-y-2">
              {ORDERED_STEPS.map((s) => {
                const currentIdx = ORDERED_STEPS.indexOf(step as typeof ORDERED_STEPS[number]);
                const thisIdx = ORDERED_STEPS.indexOf(s);
                const isDone = step === 'done' || currentIdx > thisIdx;
                const isActive = step === s;
                return (
                  <div
                    key={s}
                    className={`flex items-center gap-2.5 text-xs px-3 py-2 rounded-lg transition-all ${
                      isDone ? 'text-green-400 bg-green-500/10' :
                      isActive ? 'text-indigo-300 bg-indigo-500/10' :
                      'text-gray-600 bg-white/[0.02]'
                    }`}
                  >
                    {isDone
                      ? <CheckCircle2 size={13} />
                      : isActive
                        ? <Loader2 size={13} className="animate-spin" />
                        : <div className="w-[13px] h-[13px] rounded-full border border-current opacity-30" />
                    }
                    {STEP_LABELS[s]}
                  </div>
                );
              })}
              {step === 'done' && metadataCid && (
                <div className="mt-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <p className="text-[10px] text-green-400 font-medium mb-1">Metadata pinned to IPFS</p>
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${metadataCid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-green-300/70 hover:text-green-300 break-all"
                  >
                    {metadataCid}
                  </a>
                </div>
              )}
            </div>
          )}

          {step === 'error' && (
            <div className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={() => { reset(); onClose(); }}
              disabled={isProcessing}
              className="flex-1 py-3 text-sm font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || isProcessing || step === 'done'}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing && <Loader2 size={16} className="animate-spin" />}
              {isProcessing ? 'Processing…' : step === 'done' ? 'Done!' : 'Upload & Link to Chain'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
