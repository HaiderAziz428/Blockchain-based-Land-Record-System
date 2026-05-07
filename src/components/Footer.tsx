import Link from 'next/link';
import { Landmark, ExternalLink, Github } from 'lucide-react';
import { CONTRACT_ADDRESS } from '@/src/utils/contract';

const PRODUCT_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Verify a Property', href: '/verify' },
];

const PORTAL_LINKS = [
  { label: 'Landowner Dashboard', href: '/dashboard/user' },
  { label: 'Government Admin', href: '/dashboard/admin' },
];

export default function Footer() {
  const year = new Date().getFullYear();
  const etherscan = `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`;

  return (
    <footer className="mt-16 border-t border-white/[0.05] bg-[#0a0b1e]">
      <div className="max-w-6xl mx-auto px-6 md:px-12 py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="bg-indigo-600 p-2 rounded-lg border border-indigo-500/50">
                <Landmark className="text-white" size={18} strokeWidth={1.5} />
              </div>
              <span className="font-bold tracking-tight text-white">LandLedger</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              A fully decentralized land registry built on Ethereum and IPFS. Tamper-proof
              ownership, public verification, no middlemen.
            </p>
            <div className="text-[11px] text-gray-600 leading-relaxed">
              Network: <span className="text-gray-500">Sepolia Testnet</span>
              <br />
              Token: <span className="text-gray-500">PakLandRegistry (PLR)</span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h5 className="font-medium mb-4 text-sm text-gray-300">Product</h5>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-gray-500 hover:text-white transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Portals */}
          <div>
            <h5 className="font-medium mb-4 text-sm text-gray-300">Portals</h5>
            <ul className="space-y-2.5">
              {PORTAL_LINKS.map(({ label, href }) => (
                <li key={label}>
                  <Link
                    href={href}
                    className="text-sm text-gray-500 hover:text-white transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* On-chain */}
          <div>
            <h5 className="font-medium mb-4 text-sm text-gray-300">On-Chain</h5>
            <ul className="space-y-2.5 text-sm text-gray-500">
              <li>
                <a
                  href={etherscan}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  View Contract on Etherscan
                </a>
              </li>
              <li>
                <a
                  href="https://sepoliafaucet.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <ExternalLink size={13} strokeWidth={1.5} />
                  Get Sepolia Test ETH
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/HaiderAziz428/Blockchain-based-Land-Record-System"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Github size={13} strokeWidth={1.5} />
                  Source on GitHub
                </a>
              </li>
              <li className="pt-1">
                <p className="text-[11px] text-gray-600 break-all font-mono leading-relaxed">
                  {CONTRACT_ADDRESS}
                </p>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <span>© {year} LandLedger. Final Year Project — research-grade prototype on Sepolia testnet.</span>
          <div className="flex items-center gap-4">
            <Link href="/verify" className="hover:text-gray-400 transition-colors">Public Verification</Link>
            <a
              href={etherscan}
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-400 transition-colors"
            >
              Contract
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
