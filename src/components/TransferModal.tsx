'use client';
import { useState, useEffect, useRef } from 'react';
import { usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { isAddress } from 'viem';
import { X, Loader2, ArrowRightLeft } from 'lucide-react';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import { formatBps } from '@/src/utils/roleConstants';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  landId: string;
  currentShareBps: number; // caller's current bps balance
  onSuccess: (txHash: string) => void;
}

/**
 * Transfer a share (bps) of a land parcel to another wallet.
 * salePrice is always 0 — direct transfers are gifts/family moves only.
 * Paid sales must go through the marketplace (listShareForSale → buyShare).
 * Calls: transferShare(landId, recipient, shareBps, 0)
 */
export default function TransferModal({
  isOpen,
  onClose,
  landId,
  currentShareBps,
  onSuccess,
}: TransferModalProps) {
  const [recipient, setRecipient] = useState('');
  const [bpsToTransfer, setBpsToTransfer] = useState('');
  const [validationError, setValidationError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const hasProcessedRef = useRef(false);

  const publicClient = usePublicClient();
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (!isAddress(recipient)) {
      setValidationError('Enter a valid Ethereum address (0x...).');
      return;
    }
    const bps = parseInt(bpsToTransfer, 10);
    if (!bps || bps <= 0 || bps > currentShareBps) {
      setValidationError(
        `Share bps must be between 1 and ${currentShareBps} (your current balance).`
      );
      return;
    }

    if (!publicClient) return;
    setIsValidating(true);
    hasProcessedRef.current = false;

    try {
      // Check recipient is registered
      const profile = (await publicClient.readContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'getUser',
        args: [recipient as `0x${string}`],
      })) as { name: string; cnic: string; isRegistered: boolean };

      if (!profile.isRegistered) {
        setValidationError(
          'Recipient is not registered in the Land Registry. They must register via the User Portal first.'
        );
        setIsValidating(false);
        return;
      }

      writeContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'transferShare',
        args: [landId, recipient as `0x${string}`, bps, BigInt(0)],
      });
    } catch {
      setValidationError('Failed to validate recipient on-chain. Check your connection.');
    }
    setIsValidating(false);
  };

  useEffect(() => {
    if (isSuccess && hash && !hasProcessedRef.current) {
      hasProcessedRef.current = true;
      onClose();
      onSuccess(hash);
    }
  }, [isSuccess, hash]);

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

        <h2 className="text-2xl font-bold text-white text-center mb-1">Transfer Share</h2>
        <p className="text-sm text-white/50 text-center mb-1 font-mono">{landId}</p>
        <p className="text-xs text-white/30 text-center mb-3">
          Your share: {formatBps(currentShareBps)} ({currentShareBps} bps)
        </p>
        <p className="text-xs text-yellow-400/80 text-center mb-5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
          For gifts &amp; family transfers only. To sell for ETH, use the Marketplace.
        </p>

        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Recipient Wallet Address</label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => { setRecipient(e.target.value); setValidationError(''); }}
              className="w-full bg-black/30 border border-white/10 p-4 rounded-xl text-white font-mono text-sm outline-none focus:border-indigo-500"
              placeholder="0x..."
              disabled={isPending || isConfirming}
            />
          </div>

          <div>
            <label className="text-xs text-white/60 mb-1 block">
              Share to transfer (bps, max {currentShareBps})
            </label>
            <input
              type="number"
              min="1"
              max={currentShareBps}
              value={bpsToTransfer}
              onChange={(e) => setBpsToTransfer(e.target.value)}
              className="w-full bg-black/30 border border-white/10 p-4 rounded-xl text-white font-mono text-sm outline-none focus:border-indigo-500"
              placeholder={`e.g. ${currentShareBps}`}
              disabled={isPending || isConfirming}
              required
            />
            {bpsToTransfer && (
              <p className="text-xs text-white/40 mt-1">
                = {formatBps(parseInt(bpsToTransfer) || 0)} of this land
              </p>
            )}
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
              {isValidating
                ? 'Validating recipient…'
                : isPending
                ? 'Confirm in wallet…'
                : 'Confirming on-chain…'}
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
              disabled={isPending || isConfirming || isValidating || !recipient || !bpsToTransfer}
              className="flex-[2] bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50"
            >
              Transfer Share
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
