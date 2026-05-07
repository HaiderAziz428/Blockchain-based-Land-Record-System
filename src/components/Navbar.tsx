'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Landmark, Menu, X } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Marketplace', href: '/marketplace' },
  { label: 'Verify', href: '/verify' },
  { label: 'User', href: '/dashboard/user' },
  { label: 'Admin', href: '/dashboard/admin' },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close mobile menu whenever the route changes
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.05] bg-[#0a0b1e]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 md:px-10 py-3.5">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="LandLedger home">
          <div className="bg-indigo-600 p-2 rounded-lg border border-indigo-500/50 transition-transform group-hover:scale-105">
            <Landmark className="text-white" size={20} strokeWidth={1.5} />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight text-white">LandLedger</span>
            <span className="text-[10px] text-gray-400 font-medium tracking-wide">Government Records</span>
          </div>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ label, href }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'text-white bg-white/[0.06]'
                    : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side: wallet + (mobile) hamburger */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
          </div>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="md:hidden p-2 rounded-md text-gray-300 hover:text-white hover:bg-white/[0.04] transition-colors"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-white/[0.05] bg-[#0a0b1e]/95 backdrop-blur-md">
          <div className="px-5 py-3 space-y-1">
            {NAV_LINKS.map(({ label, href }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'text-white bg-white/[0.06]'
                      : 'text-gray-300 hover:text-white hover:bg-white/[0.03]'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
            <div className="pt-2 sm:hidden">
              <ConnectButton accountStatus="avatar" chainStatus="icon" showBalance={false} />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
