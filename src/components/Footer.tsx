import Link from 'next/link';
import { ExternalLink, Github } from 'lucide-react';
import { CONTRACT_V9_ADDRESS } from '@/src/utils/contractV9';

const PRODUCT = [
  { label: 'Home', href: '/' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Verify a Property', href: '/verify' },
];
const PORTALS = [
  { label: 'Landowner Dashboard', href: '/dashboard/user' },
  { label: 'Government Admin', href: '/dashboard/admin' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const etherscan = `https://etherscan.io/address/${CONTRACT_V9_ADDRESS}`;

  return (
    <footer className="px-6 pb-5 pt-3 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="rounded-2xl border border-border bg-surface p-6 md:p-8 flex flex-col justify-between min-h-[420px]">

          {/* ── Top: description ── */}
          <div className="max-w-sm">
            <h3 className="font-serif font-light text-3xl text-foreground leading-snug mb-4">
              Decentralized.<br />Tamper-proof.<br />Publicly verifiable.
            </h3>
            <p className="font-sans text-sm text-muted font-light leading-relaxed">
              A fully decentralized land registry on Ethereum and IPFS. Ownership lives
              on-chain. Documents live on IPFS. No middlemen, no forgery.
            </p>

            {/* Chain info chips */}
            <div className="flex flex-wrap gap-2 mt-5">
              {[
                { label: 'Mainnet' },
                { label: 'ERC-721 · PLR' },
                { label: 'IPFS · Pinata' },
              ].map(({ label }) => (
                <span
                  key={label}
                  className="font-mono text-[10px] text-muted border border-border/60 px-2.5 py-1 rounded-full"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Middle: links ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-10 border-t border-border mt-8">
            <div>
              <h5 className="font-sans text-xs font-semibold text-muted uppercase tracking-[0.15em] mb-4">Product</h5>
              <ul className="space-y-2.5">
                {PRODUCT.map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href} className="font-sans text-sm text-muted hover:text-foreground transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="font-sans text-xs font-semibold text-muted uppercase tracking-[0.15em] mb-4">Portals</h5>
              <ul className="space-y-2.5">
                {PORTALS.map(({ label, href }) => (
                  <li key={label}>
                    <Link href={href} className="font-sans text-sm text-muted hover:text-foreground transition-colors">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="font-sans text-xs font-semibold text-muted uppercase tracking-[0.15em] mb-4">On-Chain</h5>
              <ul className="space-y-2.5">
                <li>
                  <a href={etherscan} target="_blank" rel="noreferrer"
                    className="font-sans text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1.5">
                    <ExternalLink size={12} strokeWidth={1.5} />
                    View on Etherscan
                  </a>
                </li>
                <li>
                  <a href="https://faucet.metamask.io/" target="_blank" rel="noreferrer"
                    className="font-sans text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1.5">
                    <ExternalLink size={12} strokeWidth={1.5} />
                    Get Test ETH
                  </a>
                </li>
                <li>
                  <a href="https://github.com/HaiderAziz428/Blockchain-based-Land-Record-System" target="_blank" rel="noreferrer"
                    className="font-sans text-sm text-muted hover:text-foreground transition-colors flex items-center gap-1.5">
                    <Github size={12} strokeWidth={1.5} />
                    Source on GitHub
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="font-sans text-xs font-semibold text-muted uppercase tracking-[0.15em] mb-4">Contract</h5>
              <p className="font-mono text-[10px] text-muted break-all leading-relaxed">
                {CONTRACT_V9_ADDRESS}
              </p>
            </div>
          </div>

          {/* ── Bottom: wordmark + copyright ── */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-t border-border pt-6 overflow-hidden">
            <div
              className="font-serif font-bold text-5xl md:text-[7rem] text-foreground/70 leading-none tracking-tighter select-none"
              aria-hidden="true"
            >
              LandLedger
            </div>
            <div className="flex flex-col items-start md:items-end gap-2 mb-1">
              <div className="flex gap-5 text-sm">
                <Link href="/verify" className="font-sans text-muted hover:text-foreground transition-colors">
                  Public Verification
                </Link>
                <a href={etherscan} target="_blank" rel="noreferrer"
                  className="font-sans text-muted hover:text-foreground transition-colors">
                  Contract
                </a>
              </div>
              <p className="font-sans text-xs text-muted-foreground">
                © {year} LandLedger — FYP research prototype on Ethereum.
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
