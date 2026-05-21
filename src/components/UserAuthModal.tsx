'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ShieldCheck, Loader2, X } from 'lucide-react';
import { supabase } from '@/src/lib/supabase';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';

interface UserAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserAuthModal({ isOpen, onClose }: UserAuthModalProps) {
  const [name, setName] = useState('');
  const [cnic, setCnic] = useState('');
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !cnic) return;
    setErrorMsg('');
    setStatus('Validating identity in Govt DB…');

    try {
      const { data: citizen, error } = await supabase
        .from('govt_citizens')
        .select('*')
        .eq('cnic', cnic)
        .single();

      if (error || !citizen) {
        setStatus('');
        setErrorMsg('CNIC not found in the government census database. Double-check the number and try again.');
        return;
      }

      setStatus('Identity verified. Please sign in MetaMask…');
      writeContract({
        address: CONTRACT_V9_ADDRESS,
        abi: CONTRACT_V9_ABI,
        functionName: 'registerUser',
        args: [name, cnic],
      });
    } catch (err) {
      console.error(err);
      setStatus('');
      setErrorMsg('Could not reach the government database. Check your internet connection.');
    }
  };

  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => router.push('/dashboard/user'), 1200);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, router]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4">
      <div className="glass-card p-8 rounded-2xl w-full max-w-md relative animate-[fadeUp_0.3s_ease]">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors">
          <X size={18} />
        </button>

        <div className="flex justify-center mb-5">
          <div className="bg-accent/15 p-3 rounded-xl">
            <ShieldCheck size={28} className="text-accent" />
          </div>
        </div>

        <h2 className="text-xl font-semibold text-foreground text-center mb-1.5">Citizen Verification</h2>
        <p className="text-muted text-center text-sm mb-6">
          Link your Ethereum Wallet to your National Identity (CNIC).
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-xs text-muted mb-1.5 block">Full Name (as per CNIC)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
              placeholder="e.g. Ali Khan"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted mb-1.5 block">CNIC Number</label>
            <input
              type="text"
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              className="field font-mono"
              placeholder="11111-1111111-1"
              required
            />
          </div>

          {(status || isPending || isConfirming || isSuccess) && (
            <div className="flex items-center justify-center gap-2 text-sm text-accent bg-accent/10 py-2 rounded-lg border border-accent/20">
              <Loader2 className="animate-spin" size={14} />
              {isSuccess
                ? 'Registered! Redirecting…'
                : isPending
                ? 'Check Wallet…'
                : isConfirming
                ? 'Registering on Chain…'
                : status}
            </div>
          )}

          {errorMsg && (
            <div className="text-danger text-xs p-3 bg-danger/10 rounded-lg border border-danger/20">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || isConfirming}
            className="btn-primary w-full py-3 rounded-lg mt-2"
          >
            Verify & Register
          </button>
        </form>
      </div>
    </div>
  );
}
