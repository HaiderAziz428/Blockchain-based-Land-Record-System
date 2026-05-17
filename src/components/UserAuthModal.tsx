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

/**
 * Registration modal — unchanged function signature (registerUser(name, cnic)).
 * Updated to use CONTRACT_V9_ABI / CONTRACT_V9_ADDRESS.
 */
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
      // Read-only check against mock Govt citizen DB
      const { data: citizen, error } = await supabase
        .from('govt_citizens')
        .select('*')
        .eq('cnic', cnic)
        .single();

      if (error || !citizen) {
        setStatus('');
        setErrorMsg(
          'CNIC not found in the government census database. Double-check the number and try again.'
        );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0b1e]/80 backdrop-blur-md p-4">
      <div className="glass-card p-8 rounded-3xl w-full max-w-md relative animate-[fadeUp_0.3s_ease]">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white">
          <X size={20} />
        </button>

        <div className="flex justify-center mb-4">
          <div className="bg-brand-primary/20 p-3 rounded-2xl">
            <ShieldCheck size={32} className="text-brand-primary" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white text-center mb-2">Citizen Verification</h2>
        <p className="text-white/60 text-center text-sm mb-6">
          Link your Ethereum Wallet to your National Identity (CNIC).
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-xs text-white/60 mb-1 block">Full Name (as per CNIC)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white focus:outline-none focus:border-brand-primary"
              placeholder="e.g. Ali Khan"
              required
            />
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1 block">CNIC Number</label>
            <input
              type="text"
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              className="w-full bg-black/30 border border-white/10 p-3 rounded-xl text-white focus:outline-none focus:border-brand-primary font-mono"
              placeholder="11111-1111111-1"
              required
            />
          </div>

          {(status || isPending || isConfirming || isSuccess) && (
            <div className="flex items-center justify-center gap-2 text-sm text-brand-secondary bg-brand-secondary/10 py-2 rounded-lg">
              <Loader2 className="animate-spin" size={16} />
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
            <div className="text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending || isConfirming}
            className="w-full bg-brand-primary hover:bg-indigo-500 py-3.5 rounded-xl font-bold text-white transition-all disabled:opacity-50 mt-2"
          >
            Verify & Register
          </button>
        </form>
      </div>
    </div>
  );
}
