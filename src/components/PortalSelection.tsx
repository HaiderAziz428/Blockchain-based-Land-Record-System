'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACT_V9_ABI, CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';
import UserAuthModal from './UserAuthModal';
import { User, Building2, ArrowRight, Loader2, Lock, CheckCircle, AlertCircle } from 'lucide-react';

export default function PortalSelection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [isModalOpen, setModalOpen] = useState(false);
  const [isChecking,  setIsChecking]  = useState(false);
  const [notice,      setNotice]      = useState<string | null>(null);

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
    if (!isConnected) { setNotice('Connect your wallet first — use the Connect button top-right.'); return; }
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
    if (!isConnected) { setNotice('Connect your wallet first — use the Connect button top-right.'); return; }
    setNotice(null);
    router.push('/dashboard/admin');
  };

  return (
    <section id="portals" className="px-6 pb-24 scroll-mt-20 max-w-7xl mx-auto">

      {/* Section header */}
      <div className="mb-4">
        <span className="text-xs font-semibold font-sans text-muted tracking-[0.2em] uppercase">
          Access Portals
        </span>
        <div className="flex items-end justify-between gap-4 flex-wrap mt-3">
          <h2 className="font-serif font-light text-4xl md:text-[2.75rem] text-foreground leading-tight">
            Choose your portal
          </h2>
          {mounted && isConnected && (
            <span className="font-mono text-xs text-muted mb-1">
              {address?.slice(0, 6)}…{address?.slice(-4)}
            </span>
          )}
        </div>
        <p className="font-sans text-sm text-muted mt-2">
          Wallet-gated. Admin access is restricted to the contract owner.
        </p>
      </div>

      {/* Notice banner */}
      {notice && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm font-sans flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Portal cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">

        {/* ── Landowner ── */}
        <button
          type="button"
          onClick={handleUserPortalClick}
          disabled={!mounted || (isConnected && isBlockchainLoading) || isChecking}
          className="group relative text-left rounded-2xl border border-border/60 bg-surface/50 hover:bg-surface hover:border-accent/40 transition-all p-5 sm:p-7 overflow-hidden disabled:cursor-wait"
        >
          {mounted && isConnected && (isBlockchainLoading || isChecking) && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-20 rounded-2xl gap-2 text-xs text-muted font-sans">
              <Loader2 className="animate-spin text-accent" size={16} />
              Reading on-chain registration…
            </div>
          )}

          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <User size={18} className="text-accent" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-sans text-base font-semibold text-foreground">Landowner</h3>
                <p className="font-mono text-[11px] text-muted">/dashboard/user</p>
              </div>
            </div>
            {mounted && isConnected && isRegistered ? (
              <span className="flex items-center gap-1 text-[11px] font-sans text-success bg-success/10 border border-success/20 px-2.5 py-1 rounded-full">
                <CheckCircle size={10} /> Registered
              </span>
            ) : (
              <span className="text-[11px] font-sans text-muted">Unregistered</span>
            )}
          </div>

          <ul className="font-sans text-sm text-muted space-y-2 mb-6">
            <li className="flex items-center gap-2 border-t border-border/40 pt-2">Mint, transfer, list &amp; vote on succession</li>
            <li className="flex items-center gap-2 border-t border-border/40 pt-2">CNIC verified once against allotment registry</li>
            <li className="flex items-center gap-2 border-t border-border/40 pt-2">All actions signed by your own wallet</li>
          </ul>

          <div className="flex items-center justify-between">
            <span className="font-sans text-sm text-muted">
              {mounted && isConnected && isRegistered ? 'Open dashboard →' : 'Begin onboarding →'}
            </span>
            <ArrowRight size={15} className="text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </div>
        </button>

        {/* ── Government / Developer ── */}
        <button
          type="button"
          onClick={handleAdminPortalClick}
          className="group relative text-left rounded-2xl border border-border/60 bg-surface/50 hover:bg-surface hover:border-accent/40 transition-all p-5 sm:p-7"
        >
          <div className="flex items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                <Building2 size={18} className="text-accent" strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="font-sans text-base font-semibold text-foreground">Government / Developer</h3>
                <p className="font-mono text-[11px] text-muted">/dashboard/admin</p>
              </div>
            </div>
            <span className="flex items-center gap-1 text-[11px] font-sans text-muted bg-surface border border-border/60 px-2.5 py-1 rounded-full">
              <Lock size={10} /> Owner only
            </span>
          </div>

          <ul className="font-sans text-sm text-muted space-y-2 mb-6">
            <li className="border-t border-border/40 pt-2">Initiate succession plans (multi-heir)</li>
            <li className="border-t border-border/40 pt-2">Resolve disputes — force execute or revert</li>
            <li className="border-t border-border/40 pt-2">Whitelist developer / authority wallets</li>
          </ul>

          <div className="flex items-center justify-between">
            <span className="font-sans text-sm text-muted">Open admin tools →</span>
            <ArrowRight size={15} className="text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </div>
        </button>
      </div>

      <UserAuthModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
