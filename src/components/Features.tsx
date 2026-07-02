import { ShieldCheck, Globe, Users, Store } from 'lucide-react';

const FEATURES = [
  {
    Icon: ShieldCheck,
    title: 'Unforgeable NFT Ownership',
    desc: 'Each plot is an ERC-721 token. No clerk can alter it, no forged letter can move it. Only the private-key holder can transfer.',
  },
  {
    Icon: Globe,
    title: 'Public Verification',
    desc: 'Anyone can query "who owns plot 42?" for free, without visiting a transfer office. No fee, no wait, no middleman.',
  },
  {
    Icon: Users,
    title: 'Transparent Succession',
    desc: 'Multi-heir voting enforced on-chain. 100% approval required. Disputes lock the asset until a government admin resolves on-chain.',
  },
  {
    Icon: Store,
    title: 'Decentralized Marketplace',
    desc: 'Listings, prices, and metadata stored entirely on-chain + IPFS. No central database an admin can tamper with.',
  },
];

export default function Features() {
  return (
    <section className="px-6 pb-24 max-w-7xl mx-auto">
      <div className="mb-4">
        <span className="text-xs font-semibold font-sans text-muted tracking-[0.2em] uppercase">
          Core Capabilities
        </span>
        <h2 className="font-serif font-light text-4xl md:text-[2.75rem] text-foreground mt-3 leading-tight tracking-tight">
          Built for trust, not convenience
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 pt-10 sm:pt-20">
        {FEATURES.map(({ Icon, title, desc }, i) => (
          <div key={title} className="flex flex-col">
            <div className="w-full border-t border-border mb-6 relative">
              <div className="absolute top-0 left-0 h-[2px] w-8 bg-accent" />
            </div>
            {/* <div className="flex items-start justify-between mb-8">
              <Icon size={20} className="text-accent" strokeWidth={1.5} />
              <span className="font-mono text-[11px] text-muted/50">0{i + 1}</span>
            </div> */}
            <h3 className="font-sans text-base font-semibold text-foreground mb-3 tracking-tight leading-snug">
              {title}
            </h3>
            <p className="font-sans text-sm text-muted font-light leading-relaxed">
              {desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
