'use client';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Header() {
  return (
    <header className="fixed top-0 w-full z-50 bg-[#0f172a]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Logo Section */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">L</span>
          </div>
          <span className="text-xl font-bold text-white tracking-wide">
            LANDLEDGER
          </span>
        </div>

        {/* Navigation Section */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-300">
          <Link href="/" className="hover:text-blue-400 transition-colors">Home</Link>
          <Link href="/about" className="hover:text-blue-400 transition-colors">About</Link>
          <Link href="/services" className="hover:text-blue-400 transition-colors">Services</Link>
          <Link href="/contact" className="hover:text-blue-400 transition-colors">Contact</Link>
          <Link href="/marketplace" className="hover:text-blue-400 transition-colors">Marketplace</Link>
        </nav>

        {/* Wallet Section - RainbowKit handles the heavy lifting */}
        <div>
          <ConnectButton 
            accountStatus="avatar" 
            chainStatus="icon"
            showBalance={true}
          />
        </div>

      </div>
    </header>
  );
}