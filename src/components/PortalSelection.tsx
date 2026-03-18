'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/src/utils/contract';
import UserAuthModal from './UserAuthModal';
import {
  User,
  Building2,
  Search,
  FileText,
  CheckCircle,
  ShieldCheck,
  ArrowRight,
  Database,
  Loader2,
  Lock,
  Globe,
  Cpu,
  Fingerprint,
} from "lucide-react";

export default function PortalSelection() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const router = useRouter();

  const [isModalOpen, setModalOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const { data: userData, isLoading: isBlockchainLoading } = useReadContract({
    address: CONTRACT_ADDRESS as `0x${string}`,
    abi: CONTRACT_ABI,
    functionName: 'users',
    args: [address as `0x${string}`],
    query: { enabled: !!address && isConnected },
  });

  const handleUserPortalClick = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first using the Connect button in the Navbar.");
      return;
    }
    setIsChecking(true);
    const profile = userData as readonly [string, string, boolean] | undefined;
    const isRegistered = Boolean(profile?.[2]);
    if (isRegistered) {
      localStorage.setItem('verified_user', JSON.stringify({
        full_name: profile?.[0],
        cnic: profile?.[1],
        onChain: true,
      }));
      router.push('/dashboard/user');
    } else {
      setModalOpen(true);
    }
    setIsChecking(false);
  };

  const handleAdminPortalClick = () => {
    if (!isConnected) {
      alert("Please connect your wallet first!");
      return;
    }
    router.push('/dashboard/admin');
  };

  const trustBadges = [
    { icon: Lock, label: "256-bit Encryption" },
    { icon: Globe, label: "Decentralized Network" },
    { icon: Cpu, label: "Smart Contract Powered" },
    { icon: Fingerprint, label: "On-Chain Identity" },
  ];

  return (
    <section className="px-6 md:px-12 py-16">

      {/* Section header */}
      <div className="text-center mb-12">
        <span className="inline-block text-gray-400 font-medium tracking-wide uppercase text-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-1 rounded-md mb-4">
          Access Portal
        </span>
        <h2 className="text-3xl md:text-4xl font-bold mb-3 text-white tracking-tight">
          Choose Your Portal
        </h2>
        <p className="text-gray-500 max-w-md mx-auto text-sm leading-relaxed">
          Select the appropriate access portal. All interactions are secured on-chain and require a connected wallet.
        </p>
      </div>

      {/* Portal Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl mx-auto mb-10">

        {/* USER PORTAL */}
        <div
          onClick={handleUserPortalClick}
          className="group relative cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors duration-200 p-7 overflow-hidden"
        >
          {/* Loading Overlay */}
          {(!mounted || isBlockchainLoading || isChecking) && (
            <div className="absolute inset-0 bg-[#0a0b1e]/85 backdrop-blur-sm flex flex-col items-center justify-center z-20 rounded-2xl">
              <Loader2 className="animate-spin text-indigo-400 mb-2" size={28} />
              <p className="text-xs text-gray-400 font-medium">Reading blockchain state…</p>
            </div>
          )}

          {/* Top row: icon + badge */}
          <div className="flex items-start justify-between mb-5">
            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center">
              <User size={18} className="text-white" strokeWidth={1.5} />
            </div>
            {mounted && isConnected && Boolean((userData as readonly [string, string, boolean] | undefined)?.[2]) ? (
              <span className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-medium px-2.5 py-1 rounded-full">
                <CheckCircle size={11} /> Registered
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-white/5 border border-white/10 text-gray-500 text-xs font-medium px-2.5 py-1 rounded-full">
                Citizen
              </span>
            )}
          </div>

          <h3 className="text-lg font-semibold text-white mb-1.5">Landowner Portal</h3>
          <p className="text-gray-500 text-sm mb-5 leading-relaxed">
            View and manage your property records. New users complete a one-time CNIC verification against Government records.
          </p>

          <ul className="space-y-2.5 mb-6">
            {[
              { icon: Search, text: "Search & verify property records" },
              { icon: FileText, text: "View ownership documents & history" },
              { icon: CheckCircle, text: "Blockchain-verified ownership proof" },
            ].map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-gray-400">
                <Icon size={14} className="text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                {text}
              </li>
            ))}
          </ul>

          <button className="w-full bg-white hover:bg-gray-100 transition-colors py-2.5 rounded-lg text-sm font-medium text-black flex items-center justify-center gap-2">
            {Boolean((userData as readonly [string, string, boolean] | undefined)?.[2]) ? "Enter Dashboard" : "Access User Portal"}
            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* ADMIN PORTAL */}
        <div
          onClick={handleAdminPortalClick}
          className="group relative cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-colors duration-200 p-7 overflow-hidden"
        >
          {/* Top row: icon + badge */}
          <div className="flex items-start justify-between mb-5">
            <div className="w-10 h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center">
              <Building2 size={18} className="text-white" strokeWidth={1.5} />
            </div>
            <span className="flex items-center gap-1 bg-white/5 border border-white/10 text-gray-500 text-xs font-medium px-2.5 py-1 rounded-full">
              <Lock size={10} /> Restricted
            </span>
          </div>

          <h3 className="text-lg font-semibold text-white mb-1.5">Government Officials Portal</h3>
          <p className="text-gray-500 text-sm mb-5 leading-relaxed">
            Manage land registrations, verify documents, and oversee on-chain transactions. Restricted to authorized Government wallets.
          </p>

          <ul className="space-y-2.5 mb-6">
            {[
              { icon: ShieldCheck, text: "Register & mint new property records" },
              { icon: Database, text: "Verify & approve transactions on-chain" },
              { icon: Lock, text: "Administrative oversight & full control" },
            ].map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-gray-400">
                <Icon size={14} className="text-gray-400 flex-shrink-0" strokeWidth={1.5} />
                {text}
              </li>
            ))}
          </ul>

          <button className="w-full bg-transparent border border-white/20 hover:bg-white/5 transition-colors py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-2">
            Access Admin Portal
            <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Trust strip */}
      <div className="max-w-4xl mx-auto border-t border-white/[0.06] pt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        {trustBadges.map(({ icon: Icon, label }, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Icon size={14} className="text-gray-400 flex-shrink-0" strokeWidth={1.5} />
            <span className="text-[11px] text-gray-400">{label}</span>
          </div>
        ))}
      </div>

      <UserAuthModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}