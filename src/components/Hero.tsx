'use client';

import Link from 'next/link';
import { Shield, Database, Zap, Landmark, ArrowRight } from 'lucide-react';

const FACTS = [
  { label: 'Token Standard', value: 'ERC-721' },
  { label: 'Network', value: 'Sepolia' },
  { label: 'Document Storage', value: 'IPFS' },
  { label: 'Verification', value: 'Public' },
];

const FEATURES = [
  { icon: Zap, label: 'Cryptographic Ownership' },
  { icon: Database, label: 'Immutable On-Chain Records' },
  { icon: Landmark, label: 'Government-Verified Mint' },
];

export default function Hero() {
  const scrollToPortals = () => {
    document.getElementById('portals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="flex flex-col items-center justify-center text-center px-6 py-24 min-h-[calc(100vh-64px)]">

      {/* Badge */}
      <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 px-4 py-1.5 rounded-full text-xs font-medium mb-8 tracking-wide">
        <Shield size={13} className="text-indigo-400" />
        Secured by Ethereum &amp; IPFS
      </div>

      {/* Heading */}
      <h1 className="text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-5 max-w-3xl text-white">
        Tamper-proof Land Records,
        <br />
        <span className="text-indigo-400">Verified On-Chain.</span>
      </h1>

      {/* Subheading */}
      <p className="text-gray-400 text-base mb-10 max-w-xl leading-relaxed">
        A fully decentralized land registry built on the Ethereum Sepolia testnet. Each parcel is an
        ERC-721 NFT; every deed is pinned to IPFS. Anyone can verify ownership in seconds — no
        clerk, no fee, no waiting.
      </p>

      {/* Feature pills */}
      <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 mb-10 text-sm text-gray-400">
        {FEATURES.map(({ icon: Icon, label }, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Icon size={14} className="text-indigo-400 flex-shrink-0" />
            <span>{label}</span>
            {i < FEATURES.length - 1 && (
              <span className="ml-6 hidden md:inline-block w-px h-3 bg-white/10" />
            )}
          </div>
        ))}
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-wrap justify-center gap-3 mb-20">
        <button
          type="button"
          onClick={scrollToPortals}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 transition-colors px-7 py-2.5 rounded-lg text-sm font-semibold text-white"
        >
          Get Started <ArrowRight size={15} />
        </button>
        <Link
          href="/verify"
          className="bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-colors px-7 py-2.5 rounded-lg text-sm font-semibold text-gray-300"
        >
          Verify a Property
        </Link>
      </div>

      {/* Honest project facts (replaces fake "50K+ users" stats) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
        {FACTS.map((f, i) => (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/[0.07] p-5 rounded-2xl text-left"
          >
            <p className="text-xl md:text-2xl font-bold text-white mb-0.5">{f.value}</p>
            <p className="text-gray-500 text-xs">{f.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
