'use client';

import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';

const STATS = [
  { label: 'Token Standard', value: 'ERC-721', sub: 'PakLandRegistry · PLR' },
  { label: 'Document Storage', value: 'IPFS', sub: 'Content-addressed · Pinata' },
  { label: 'Network', value: 'Mainnet', sub: 'Ethereum' },
];

export default function Hero() {
  const scrollToPortals = () =>
    document.getElementById('portals')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <section className="relative flex flex-col items-center justify-center min-h-[calc(100vh-64px)] px-6 pt-12 sm:pt-0 overflow-hidden">

      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-accent/8 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] rounded-full bg-accent/5 blur-[100px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center max-w-4xl mx-auto">

        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2.5 mb-8">
          <span className="h-px w-8 bg-accent/60" />
          <span className="font-mono text-[11px] tracking-[0.2em] text-accent uppercase">
            Ethereum · ERC-721 · IPFS
          </span>
          <span className="h-px w-8 bg-accent/60" />
        </div>

        {/* Headline */}
        <h1 className="font-sans font-bold text-5xl md:text-[4.5rem] leading-[1.0] tracking-tight text-foreground mb-6">
          Blockchain Based
          <br />
          <span className="text-accent">Land Records</span>
        </h1>

        {/* Sub */}
        <p className="font-sans text-muted text-md leading-relaxed max-w-xl mx-auto mb-10">
          Pakistan&apos;s first blockchain-based Land Registry. Secure, transparent, and immutable property records for everyone.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap justify-center gap-3 mb-14">
          <button
            type="button"
            onClick={scrollToPortals}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold font-sans px-8 py-3 rounded-lg text-sm transition-colors"
          >
            Get Started <ArrowRight size={14} />
          </button>
          <Link
            href="/verify"
            className="inline-flex items-center gap-2 border border-border/70 bg-surface/30 hover:bg-surface/60 text-foreground font-medium font-sans px-8 py-3 rounded-lg text-sm transition-colors backdrop-blur-sm"
          >
            Verify a Plot <ExternalLink size={13} />
          </Link>
        </div>
      </div>

      {/* Stats — unified panel */}
      <div className="relative z-10 w-full max-w-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border/60 border border-border/60 rounded-xl overflow-hidden bg-surface/20 backdrop-blur-sm">
          {STATS.map(({ label, value, sub }) => (
            <div key={label} className="px-6 py-5">
              <p className="font-mono text-2xl font-semibold text-accent mb-1">{value}</p>
              <p className="font-sans text-sm font-medium text-foreground mb-0.5">{label}</p>
              <p className="font-mono text-[11px] text-muted">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
