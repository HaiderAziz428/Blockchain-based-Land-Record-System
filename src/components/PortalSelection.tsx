'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import UserAuthModal from './UserAuthModal';
import { User, Building2, ArrowRight, Loader2, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function PortalSelection() {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [isModalOpen, setModalOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: userData, isLoading: isBlockchainLoading } = useReadContract({
    address: CONTRACT_V9_ADDRESS,
    abi: CONTRACT_V9_ABI,
    functionName: 'getUser',
    args: [address as `0x${string}`],
    query: { enabled: !!address && isConnected },
  });

  const profile = userData as { name: string; cnic: string; isRegistered: boolean } | undefined;
  const isRegistered = Boolean(profile?.isRegistered);

  const handleUserPortalClick = async () => {
    if (!isConnected) { setNotice('Connect your wallet first — top-right Connect button.'); return; }
    setNotice(null);
    setIsChecking(true);
    if (isRegistered) {
      localStorage.setItem('verified_user', JSON.stringify({
        full_name: profile?.name, cnic: profile?.cnic, onChain: true,
      }));
      router.push('/dashboard/user');
    } else {
      setModalOpen(true);
    }
    setIsChecking(false);
  };

  const handleAdminPortalClick = () => {
    if (!isConnected) { setNotice('Connect your wallet first — top-right Connect button.'); return; }
    setNotice(null);
    router.push('/dashboard/admin');
  };

  return (
    <section id="portals" className="px-6 md:px-12 py-16 scroll-mt-20 max-w-5xl mx-auto">

      {/* Section header — left aligned, no marketing pre-header */}
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-white">Pick a portal</h2>
          <p className="text-sm text-gray-500 mt-1">Wallet-gated. Admin access is restricted to the contract owner.</p>
        </div>
        {mounted && isConnected && (
          <span className="text-[11px] text-gray-500 font-mono">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </span>
        )}
      </div>

      {notice && (
        <div className="mb-5 px-4 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 text-sm flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Two portal rows — denser, info-first, asymmetric content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* USER */}
        <button
          type="button"
          onClick={handleUserPortalClick}
          className="group relative text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.16] transition-colors p-6 overflow-hidden disabled:cursor-wait"
          disabled={!mounted || isBlockchainLoading || isChecking}
        >
          {(!mounted || isBlockchainLoading || isChecking) && (
            <div className="absolute inset-0 bg-[#0a0b1e]/85 backdrop-blur-sm flex items-center justify-center z-20 rounded-xl gap-2 text-xs text-gray-400">
              <Loader2 className="animate-spin text-indigo-400" size={16} />
              Reading on-chain registration…
            </div>
          )}

          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center">
                <User size={16} className="text-gray-200" strokeWidth={1.6} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Landowner</h3>
                <p className="text-[11px] text-gray-500 font-mono">/dashboard/user</p>
              </div>
            </div>
            {mounted && isConnected && isRegistered ? (
              <span className="flex items-center gap-1 text-[11px] text-green-400 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                <CheckCircle size={10} /> registered
              </span>
            ) : (
              <span className="text-[11px] text-gray-500">unregistered</span>
            )}
          </div>

          <dl className="text-[13px] divide-y divide-white/[0.04]">
            <div className="flex justify-between py-1.5">
              <dt className="text-gray-500">Mint, transfer, list, vote on succession</dt>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-gray-500">CNIC verified once against govt registry</dt>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-gray-500">All actions signed by your own wallet</dt>
            </div>
          </dl>

          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-sm">
            <span className="text-gray-400">
              {mounted && isConnected && isRegistered ? 'Open dashboard' : 'Begin onboarding'}
            </span>
            <ArrowRight size={15} className="text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </div>
        </button>

        {/* ADMIN */}
        <button
          type="button"
          onClick={handleAdminPortalClick}
          className="group relative text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.16] transition-colors p-6"
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-white/5 border border-white/10 flex items-center justify-center">
                <Building2 size={16} className="text-gray-200" strokeWidth={1.6} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Government / Developer</h3>
                <p className="text-[11px] text-gray-500 font-mono">/dashboard/admin</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] text-gray-500 bg-white/5 border border-white/10 px-2 py-0.5 rounded">
              <Lock size={10} /> owner-only
            </span>
          </div>

          <dl className="text-[13px] divide-y divide-white/[0.04]">
            <div className="flex justify-between py-1.5">
              <dt className="text-gray-500">Initiate succession plans (multi-heir)</dt>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-gray-500">Resolve disputes — force or revert</dt>
            </div>
            <div className="flex justify-between py-1.5">
              <dt className="text-gray-500">Whitelist developer / authority wallets</dt>
            </div>
          </dl>

          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-sm">
            <span className="text-gray-400">Open admin tools</span>
            <ArrowRight size={15} className="text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </div>
        </button>
      </div>

      <UserAuthModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
