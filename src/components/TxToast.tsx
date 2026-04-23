'use client';
import { X, CheckCircle, ExternalLink } from 'lucide-react';
import { useEffect } from 'react';

interface TxToastProps {
  txHash: string;
  message?: string;
  onDismiss: () => void;
}

export default function TxToast({ txHash, message = 'Transaction confirmed', onDismiss }: TxToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 12000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-[300] w-full max-w-sm animate-[fadeUp_0.3s_ease]">
      <div className="bg-[#0f172a] border border-green-500/30 rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_24px_rgba(34,197,94,0.12)]">
        <div className="flex items-start gap-3">
          <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">{message}</p>
            <p className="text-[11px] text-gray-500 font-mono mt-1 truncate">
              {txHash.slice(0, 14)}…{txHash.slice(-8)}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-gray-600 hover:text-white transition-colors flex-shrink-0 -mt-0.5"
          >
            <X size={15} />
          </button>
        </div>
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 w-full justify-center py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
        >
          <ExternalLink size={11} />
          View on Sepolia Etherscan
        </a>
      </div>
    </div>
  );
}
