'use client';

import { useState } from 'react';
import { MapPin, Shield, ArrowLeftRight, CheckCircle } from 'lucide-react';

const STEPS = [
  {
    Icon: MapPin,
    title: 'Register your CNIC',
    desc: 'Link your Pakistani national ID to your Ethereum wallet. One-time on-chain registration verified against the developer\'s allotment registry.',
  },
  {
    Icon: Shield,
    title: 'Mint your plot as an NFT',
    desc: 'Upload your allotment letter as an IPFS document. The transfer-office backend mints your ERC-721 token — unforgeable, permanent on-chain ownership.',
  },
  {
    Icon: ArrowLeftRight,
    title: 'Transfer, list, or verify',
    desc: 'List your plot on the on-chain marketplace, transfer directly, initiate succession voting — all signed by your own wallet, publicly verifiable by anyone.',
  },
];

export default function HowItWorks() {
  const [openStep, setOpenStep] = useState<number | null>(null);

  const toggle = (i: number) => setOpenStep(prev => prev === i ? null : i);

  return (
    <section className="px-6 py-24 max-w-7xl mx-auto">
      <div className="mb-4">
        <span className="text-xs font-semibold font-sans text-muted tracking-[0.2em] uppercase">
          How It Works
        </span>
        <h2 className="font-serif font-light text-4xl md:text-[2.75rem] text-foreground mt-3 leading-tight">
          Three steps from allotment<br className="hidden md:block" /> to on-chain ownership
        </h2>
      </div>

      <div className="mt-16 flex flex-col lg:flex-row gap-10 items-start">

        {/* ── Left: accordion steps ── */}
        <div className="w-full lg:w-2/5 space-y-0">
          {STEPS.map(({ Icon, title, desc }, i) => {
            const mobileOpen = openStep === i;
            return (
              <div
                key={title}
                className="group cursor-pointer md:cursor-default"
                onClick={() => toggle(i)}
              >
                <div className="border-t border-border pt-6 pb-5 relative overflow-hidden">
                  {/* Accent line — mobile: state-driven, desktop: hover / always-on for step 0 */}
                  <div className={[
                    'absolute top-0 left-0 h-[2px] bg-accent transition-all duration-500',
                    // mobile
                    mobileOpen ? 'w-full' : 'w-0',
                    // desktop overrides
                    i === 0 ? 'md:w-full' : 'md:w-0 md:group-hover:w-full',
                  ].join(' ')} />

                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-3">
                      <Icon size={15} className="text-accent flex-shrink-0" strokeWidth={1.5} />
                      <h3 className="font-sans text-sm font-semibold text-foreground tracking-tight">{title}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted/40">0{i + 1}</span>
                      {/* +/- indicator — mobile only */}
                      <span className="md:hidden font-sans text-[11px] text-muted select-none">
                        {mobileOpen ? '−' : '+'}
                      </span>
                    </div>
                  </div>

                  {/* Paragraph — mobile: state-driven, desktop: hover / always-on for step 0 */}
                  <div className={[
                    'grid transition-[grid-template-rows] duration-300 ease-in-out',
                    // mobile
                    mobileOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                    // desktop overrides
                    i === 0 ? 'md:grid-rows-[1fr]' : 'md:grid-rows-[0fr] md:group-hover:grid-rows-[1fr]',
                  ].join(' ')}>
                    <p className="font-sans text-sm text-muted leading-relaxed font-light overflow-hidden pr-4">
                      {desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="border-t border-border" />
        </div>

        {/* ── Right: ownership record mockup — hidden on mobile ── */}
        <div className="hidden lg:flex w-full lg:w-3/5 items-center justify-center">
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl overflow-hidden shadow-lg">

            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="font-mono text-xs text-muted">On-Chain Ownership Record</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">LND-042</span>
            </div>

            <div className="px-5 py-5 space-y-3">
              {[
                { label: 'Status',    value: '● ACTIVE',      accent: true  },
                { label: 'Owner',     value: '0x1a2b…3c4d',   mono: true    },
                { label: 'Land Type', value: 'Residential',   mono: false   },
                { label: 'Area',      value: '500 sq. yards', mono: false   },
                { label: 'Verified',  value: '12 Jan 2025',   mono: false   },
                { label: 'IPFS Hash', value: 'Qm4xK9…bW3z',  mono: true    },
              ].map(({ label, value, accent, mono }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="font-sans text-xs text-muted">{label}</span>
                  <span className={`text-xs font-medium ${accent ? 'text-success' : mono ? 'font-mono text-foreground' : 'font-sans text-foreground'}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-border">
              <div className="flex justify-between text-[10px] text-muted font-sans mb-1.5">
                <span>Block confirmations</span>
                <span>64 / 64</span>
              </div>
              <div className="h-1 w-full bg-border rounded-full overflow-hidden">
                <div className="h-full bg-success w-full rounded-full" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex gap-3">
              <div className="flex-1 flex items-center gap-1.5 text-xs font-sans text-accent">
                <CheckCircle size={12} strokeWidth={2} />
                View on Etherscan ↗
              </div>
              <div className="flex items-center gap-1.5 text-xs font-sans text-muted">
                IPFS Doc ↗
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
