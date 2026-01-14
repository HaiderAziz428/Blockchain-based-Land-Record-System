'use client';
import { useState, useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import { supabase } from '@/src/lib/supabase';

interface RegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RegistrationModal({ isOpen, onClose }: RegistrationModalProps) {
  const [name, setName] = useState('');
  const [cnic, setCnic] = useState('');
  const [status, setStatus] = useState(''); // Feedback text
  
  // Wagmi Hooks
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !cnic) return;
    setStatus('Validating Identity...');

    try {
      // 1. REAL WORLD CHECK: Does this CNIC exist in the Govt Mock DB?
      // We only read. We do not write.
      const { data: citizen, error } = await supabase
        .from('govt_citizens')
        .select('*')
        .eq('cnic', cnic)
        .single();

      if (error || !citizen) {
        setStatus('');
        alert("Verification Failed: This CNIC is not found in the Government Census Database.");
        return;
      }

      // Optional: Check name match (simple strict check)
      if (citizen.full_name.toLowerCase() !== name.toLowerCase()) {
         if(!confirm(`Name mismatch.\nInput: ${name}\nGovt Record: ${citizen.full_name}\nProceed anyway?`)) {
             setStatus('');
             return;
         }
      }

      // 2. BLOCKCHAIN WRITE: Link Wallet to CNIC
      setStatus('Identity Verified. Signing Transaction...');
      
      writeContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'registerUser',
        args: [name, cnic],
      });

    } catch (err) {
      console.error(err);
      setStatus('Error checking database.');
    }
  };

  // Redirect on Success
  useEffect(() => {
    if (isSuccess) {
      setStatus('Success! Redirecting...');
      setTimeout(() => {
          window.location.href = '/dashboard/user';
      }, 1000);
    }
  }, [isSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1e293b] p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-2">Citizen Registration</h2>
        <p className="text-gray-400 mb-6 text-sm">
          Link your Ethereum Wallet to your National Identity (CNIC).
        </p>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Full Name (as per CNIC)</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0f172a] border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. User One"
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">CNIC Number</label>
            <input 
              type="text" 
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              className="w-full bg-[#0f172a] border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500"
              placeholder="e.g. 11111-1111111-1"
            />
          </div>

          {(status || isPending || isConfirming) && (
            <div className="text-center text-sm font-medium text-blue-400 animate-pulse">
              {isPending ? 'Please Sign in MetaMask...' : isConfirming ? 'Registering on Blockchain...' : status}
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
                disabled={isPending || isConfirming || !name || !cnic}
                className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all disabled:opacity-50"
            >
                Verify & Register
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}