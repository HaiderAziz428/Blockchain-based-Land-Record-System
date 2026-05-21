import { ArrowRight } from 'lucide-react';

export default function CtaSection() {
  return (
    <section className="px-6 pb-16 max-w-7xl mx-auto">
      <div className="relative rounded-2xl overflow-hidden flex items-center justify-center h-80 md:h-96">

        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-accent/8 to-transparent" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in srgb, var(--accent) 20%, transparent) 0%, transparent 70%)',
          }}
        />
        <div className="dot-grid absolute inset-0 opacity-15" />
        <div className="absolute inset-0 border border-border/50 rounded-2xl" />

        {/* Content */}
        <div className="relative z-10 text-center px-8 flex flex-col items-center">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <span className="h-px w-6 bg-accent/60" />
            <span className="text-[11px] font-mono text-accent tracking-[0.2em] uppercase">
              Blockchain-Verified Ownership
            </span>
            <span className="h-px w-6 bg-accent/60" />
          </div>
          <h2 className="font-serif font-light text-3xl md:text-5xl text-foreground leading-tight tracking-tight max-w-2xl mb-8">
            Your plot, on-chain forever.
          </h2>
          <a
            href="#portals"
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold font-sans px-8 py-3 rounded-lg text-sm transition-colors"
          >
            Get Started <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
