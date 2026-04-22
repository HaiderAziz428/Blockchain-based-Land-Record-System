'use client';
import { useState, useEffect, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther } from 'viem';
import { Lock, X, Loader2 } from 'lucide-react';
import { marketDb } from '@/src/lib/marketplace';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';

interface FinalizeSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    landId: string;
    onSuccess: () => void;
}

export default function FinalizeSaleModal({ isOpen, onClose, landId, onSuccess }: FinalizeSaleModalProps) {
    const [price, setPrice] = useState('');
    const { writeContract, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
    const hasProcessedRef = useRef(false);

    useEffect(() => {
        if (!isOpen) { setPrice(''); hasProcessedRef.current = false; }
    }, [isOpen]);

    const handleFinalize = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!price || parseFloat(price) <= 0) return alert('Please enter a valid price');
        hasProcessedRef.current = false;

        writeContract({
            address: CONTRACT_ADDRESS as `0x${string}`,
            abi: CONTRACT_ABI,
            functionName: 'listLandForSale',
            args: [landId, parseEther(price)]
        });
    };

    useEffect(() => {
        const updateDatabase = async () => {
            if (isSuccess && landId && price && !hasProcessedRef.current) {
                hasProcessedRef.current = true;
                try {
                    const { error } = await marketDb.from('listings').update({ status: 'on_chain', final_price: price }).eq('land_id', landId);
                    if (error) throw error;
                    alert('✅ Price Locked on Blockchain! Buyers can purchase now.');
                    onSuccess();
                    onClose();
                } catch {
                    alert('⚠️ Blockchain success but DB update failed.');
                    hasProcessedRef.current = false;
                }
            }
        };
        updateDatabase();
    }, [isSuccess, landId, price]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0a0b1e]/80 backdrop-blur-md p-4">
            <div className="glass-card p-8 rounded-3xl w-full max-w-md relative animate-[fadeUp_0.3s_ease]">
                <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white"><X size={20} /></button>

                <div className="flex justify-center mb-4">
                    <div className="bg-green-500/20 p-3 rounded-2xl">
                        <Lock size={32} className="text-green-400" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-white text-center mb-2">Finalize Sale Price</h2>
                <p className="text-sm text-white/60 text-center mb-6">
                    Enter the negotiated price for <span className="text-white font-mono">{landId}</span>. This action locks the price on-chain.
                </p>

                <form onSubmit={handleFinalize} className="space-y-4">
                    <div>
                        <label className="text-xs text-white/60 mb-1 block">Agreed Price (ETH)</label>
                        <input
                            type="number" step="0.0001" value={price} onChange={e => setPrice(e.target.value)}
                            className="w-full bg-black/30 border border-white/10 p-4 rounded-xl text-white text-xl font-mono outline-none focus:border-green-500"
                            placeholder="0.00" required
                        />
                    </div>

                    <button type="submit" disabled={isPending || isConfirming}
                        className="w-full bg-green-600 hover:bg-green-500 py-3.5 rounded-xl font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2">
                        {(isPending || isConfirming) && <Loader2 className="animate-spin" size={18} />}
                        {isPending ? 'Check Wallet...' : isConfirming ? 'Confirming on Chain...' : 'Lock Price & Enable Buy'}
                    </button>
                </form>
            </div>
        </div>
    );
}