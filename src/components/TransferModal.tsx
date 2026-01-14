'use client';
import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { supabase } from '@/src/lib/supabase';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  land: {
    id: string;          // UUID from Supabase
    plot_number: string; // The ID used on Blockchain
    location: string;
  };
  onSuccess: () => void;
}

export default function TransferModal({ isOpen, onClose, land, onSuccess }: TransferModalProps) {
  const [receiverAddress, setReceiverAddress] = useState('');
  const [status, setStatus] = useState('');
  
  // Wagmi Hooks
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // 1. Handle Transfer Click
  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverAddress || !land.plot_number) return;

    setStatus('Validating Receiver...');

    // A. SECURITY CHECK: Does the receiver exist in our Govt DB?
    const { data: receiverData, error } = await supabase
      .from('owners')
      .select('id, name, wallet_address')
      .ilike('wallet_address', receiverAddress) // Case insensitive check
      .single();

    if (error || !receiverData) {
      alert("Error: The Receiver is not registered in the Land Registry system.\nWe cannot transfer land to an unregistered user.");
      setStatus('');
      return;
    }

    // B. BLOCKCHAIN WRITE
    setStatus('Waiting for Wallet Signature...');
    
    writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'transferLandOwnership',
        args: [
          land.plot_number,
          receiverAddress as `0x${string}`,
          BigInt(0)
        ],
      });
  };

  // 2. Post-Blockchain Sync (The Database Update)
  useEffect(() => {
    const syncOwnership = async () => {
      setStatus('Blockchain Confirmed! Updating Government Records...');
      
      // We need to find the Supabase UUID of the new owner
      const { data: newOwner } = await supabase
        .from('owners')
        .select('id')
        .ilike('wallet_address', receiverAddress)
        .single();

      if (newOwner) {
        // Update the Land Record to point to the new owner
        const { error } = await supabase
          .from('land_records')
          .update({ owner_id: newOwner.id })
          .eq('id', land.id); // Update by UUID
          
        if (!error) {
          alert("Success! Ownership has been transferred.");
          onSuccess();
          onClose();
        } else {
            console.error(error);
            alert("Blockchain Success, but DB Sync Failed. Contact Admin.");
        }
      }
    };

    if (isSuccess && receiverAddress) {
      syncOwnership();
    }
  }, [isSuccess, receiverAddress, land.id, onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e293b] p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Transfer Ownership</h2>
        <p className="text-gray-400 mb-6 text-sm">
          Transferring: <span className="text-white font-bold">{land.location} (Plot: {land.plot_number})</span>
        </p>

        <form onSubmit={handleTransfer} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Receiver Wallet Address</label>
            <input 
              type="text" 
              value={receiverAddress}
              onChange={(e) => setReceiverAddress(e.target.value)}
              className="w-full bg-[#0f172a] border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 font-mono text-sm"
              placeholder="0x..."
              disabled={isPending || isConfirming}
            />
          </div>

          {(status || isPending || isConfirming) && (
            <div className="text-center text-sm font-medium text-blue-400 animate-pulse">
              {isPending ? 'Check MetaMask...' : isConfirming ? 'Confirming on Blockchain...' : status}
            </div>
          )}

          {writeError && (
             <div className="text-red-500 text-xs p-2 bg-red-500/10 rounded">
               {writeError.message.split('\n')[0]}
             </div>
          )}

          <div className="flex gap-3 mt-6">
            <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                disabled={isPending || isConfirming}
            >
                Cancel
            </button>
            <button 
                type="submit" 
                disabled={isPending || isConfirming || !receiverAddress}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
            >
                Transfer Now
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}