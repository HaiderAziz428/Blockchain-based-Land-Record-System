'use client';
import { useState, useEffect, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { marketDb } from '@/src/lib/marketplace';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

export default function FinalizeSaleModal({ isOpen, onClose, landId, onSuccess }: any) {
    const [price, setPrice] = useState('');
    const { writeContract, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const hasProcessedRef = useRef(false); // Track if we've already processed this transaction

    // Reset when modal opens/closes
    useEffect(() => {
        if (!isOpen) {
            setPrice('');
            hasProcessedRef.current = false;
        }
    }, [isOpen]);

    const handleFinalize = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!price || parseFloat(price) <= 0) {
            alert('Please enter a valid price');
            return;
        }

        hasProcessedRef.current = false; // Reset when starting new transaction

        // Step 1: Call Smart Contract to list on-chain
        writeContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'listLandForSale',
            args: [landId, parseEther(price)]
        } as any);
    };

    // Step 2: After blockchain success, update database (run only once)
    useEffect(() => {
        const updateDatabase = async () => {
            // Only process if success, have required data, and haven't processed yet
            if (isSuccess && landId && price && !hasProcessedRef.current) {
                hasProcessedRef.current = true; // Mark as processed immediately

                try {
                    const { error } = await marketDb.from('listings')
                        .update({ status: 'on_chain', final_price: price })
                        .eq('land_id', landId);

                    if (error) throw error;

                    alert('✅ Listing is now active on the blockchain! Buyers can purchase now.');
                    onSuccess();
                    onClose();
                } catch (err: any) {
                    alert('⚠️ Blockchain success but DB update failed: ' + err.message);
                    hasProcessedRef.current = false; // Allow retry on error
                }
            }
        };
        updateDatabase();
    }, [isSuccess, landId, price]); // Removed onSuccess and onClose from dependencies

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90">
            <div className="bg-[#1e293b] p-8 rounded-xl w-full max-w-md border border-green-500/30">
                <h2 className="text-xl font-bold text-white mb-2">Finalize Sale Price</h2>
                <p className="text-sm text-gray-400 mb-6">
                    You have negotiated via WhatsApp. Now enter the <strong>Final Agreed Price</strong>.
                    This will lock the price on the Blockchain. It cannot be changed once active.
                </p>

                <form onSubmit={handleFinalize} className="space-y-4">
                    <div>
                        <label className="text-gray-400 text-xs">Agreed Price (ETH)</label>
                        <input
                            type="number" step="0.0001"
                            value={price} onChange={e => setPrice(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 p-4 rounded text-white text-xl font-mono"
                            placeholder="0.00"
                        />
                    </div>

                    <button type="submit" disabled={isPending || isConfirming}
                        className="w-full bg-green-600 hover:bg-green-700 py-3 rounded-lg font-bold text-white disabled:opacity-50">
                        {isPending ? 'Check Wallet...' : isConfirming ? 'Confirming on Blockchain...' : 'Lock Price & Enable Buy'}
                    </button>

                    <button type="button" onClick={onClose} className="w-full text-gray-500 text-sm mt-2">Cancel</button>
                </form>
            </div>
        </div>
    );
}