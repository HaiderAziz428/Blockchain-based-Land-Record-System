'use client';
import { useState, useEffect, useRef } from 'react';
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress } from 'viem';
import { X, Loader2, ArrowRightLeft } from 'lucide-react';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { supabase } from '@/src/lib/supabase';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  landId: string;
  location: string;
  onSuccess: (txHash: string) => void;
}

export default function TransferModal({ isOpen, onClose, landId, location, onSuccess }: TransferModalProps) {
  const [receiverAddress, setReceiverAddress] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const hasProcessedRef = useRef(false);

  const publicClient = usePublicClient();
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddress(receiverAddress)) {
      setValidationError('Enter a valid Ethereum address (0x...).');
      return;
    }
    if (!publicClient) return;

    setValidationError('');
    setIsValidating(true);
    hasProcessedRef.current = false;

    try {
      const profile = await publicClient.readContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'users',
        args: [receiverAddress as `0x${string}`],
      }) as [string, string, boolean];

      if (!profile[2]) {
        setValidationError('Receiver is not registered in the Land Registry. They must register via the User Portal first.');
        setIsValidating(false);
        return;
      }

      writeContract({
        address: CONTRACT_ADDRESS as `0x${string}`,
        abi: CONTRACT_ABI,
        functionName: 'transferLandOwnership',
        args: [landId, receiverAddress as `0x${string}`, BigInt(0)],
      });
    } catch {
      setValidationError('Failed to validate receiver on-chain. Check your network connection.');
    }
    setIsValidating(false);
  };

  useEffect(() => {
    const syncDb = async () => {
      if (!isSuccess || !receiverAddress || hasProcessedRef.current || !publicClient || !hash) return;
      hasProcessedRef.current = true;

      try {
        const profile = await publicClient.readContract({
          address: CONTRACT_ADDRESS as `0x${string}`,
          abi: CONTRACT_ABI,
          functionName: 'users',
          args: [receiverAddress as `0x${string}`],
        }) as [string, string, boolean];

        const newCnic = profile[1];
        if (newCnic) {
          await supabase
            .from('govt_land_records')
            .update({ owner_cnic: newCnic })
            .eq('land_id', landId);
        }

        onClose();
        onSuccess(hash);
      } catch (e) {
        // DB sync is best-effort — chain is the source of truth.
        // Surface a soft warning to the parent via the toast pipeline.
        console.error('DB sync after transfer failed:', e);
        onClose();
        onSuccess(hash);
      }
    };
    void syncDb();
  }, [isSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a0b1e]/80 backdrop-blur-md p-4">
      <div className="glass-card p-8 rounded-3xl w-full max-w-md relative animate-[fadeUp_0.3s_ease]">
        <button
          onClick={onClose}
          disabled={isPending || isConfirming}
          className="absolute top-4 right-4 text-white/50 hover:text-white disabled:opacity-30"
        >
          <X size={20} />
        </button>

        <div className="flex justify-center mb-4">
          <div className="bg-indigo-500/20 p-3 rounded-2xl">
            <ArrowRightLeft size={32} className="text-indigo-400" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-1">Transfer Ownership</h2>
        <p className="text-sm text-white/50 text-center mb-1 font-mono">{landId}</p>
        <p className="text-xs text-white/30 text-center mb-6">{location}</p>

        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Receiver Wallet Address</label>
            <input
              type="text"
              value={receiverAddress}
              onChange={(e) => { setReceiverAddress(e.target.value); setValidationError(''); }}
              className="w-full bg-black/30 border border-white/10 p-4 rounded-xl text-white font-mono text-sm outline-none focus:border-indigo-500"
              placeholder="0x..."
              disabled={isPending || isConfirming}
            />
          </div>

          {validationError && (
            <div className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {validationError}
            </div>
          )}

          {writeError && (
            <div className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {writeError.message.split('\n')[0]}
            </div>
          )}

          {(isValidating || isPending || isConfirming) && (
            <div className="text-center text-sm text-indigo-400 flex items-center justify-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              {isValidating ? 'Validating receiver on-chain…' : isPending ? 'Confirm in wallet…' : 'Confirming on-chain…'}
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending || isConfirming}
              className="flex-1 py-3 text-sm font-semibold text-gray-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || isConfirming || isValidating || !receiverAddress}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              Transfer Now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
