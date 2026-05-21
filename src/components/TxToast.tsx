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
      <div className="bg-surface border border-success/30 rounded-2xl p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4),0_0_20px_rgba(74,222,128,0.08)]">
        <div className="flex items-start gap-3">
          <CheckCircle size={18} className="text-success flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{message}</p>
            <p className="text-[11px] text-muted font-mono mt-1 truncate">
              {txHash.slice(0, 14)}…{txHash.slice(-8)}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-muted hover:text-foreground transition-colors flex-shrink-0 -mt-0.5"
          >
            <X size={14} />
          </button>
        </div>
        <a
          href={`https://sepolia.etherscan.io/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-1.5 w-full justify-center py-1.5 rounded-lg bg-surface-elevated hover:bg-accent/10 border border-border text-[11px] text-accent hover:text-accent-hover transition-colors font-medium"
        >
          <ExternalLink size={11} />
          View on Sepolia Etherscan
        </a>
      </div>
    </div>
  );
}
