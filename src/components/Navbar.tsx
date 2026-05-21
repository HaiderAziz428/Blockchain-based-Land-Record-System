'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Landmark, Menu, X, Sun, Moon,
  Home, Store, ShieldCheck, User, Settings,
  Wallet, ChevronRight,
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useTheme } from 'next-themes';

const NAV_LINKS = [
  { label: 'Home',        href: '/',                  Icon: Home },
  { label: 'Marketplace', href: '/marketplace',       Icon: Store },
  { label: 'Verify',      href: '/verify',            Icon: ShieldCheck },
  { label: 'User',        href: '/dashboard/user',    Icon: User },
  { label: 'Admin',       href: '/dashboard/admin',   Icon: Settings },
];

export default function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname?.startsWith(href);

  return (
    <nav className="sticky top-0 z-50 px-4 pt-3 pb-2">

      {/* ── Floating pill ── */}
      <div className="relative max-w-5xl mx-auto flex items-center h-11 px-3 rounded-2xl border border-border/60 bg-background/92 backdrop-blur-md shadow-sm shadow-black/20">

        {/* Left: logo */}
        <Link href="/" className="flex items-center gap-2 group flex-shrink-0" aria-label="LandLedger home">
          <div className="w-7 h-7 rounded-lg border border-accent/30 bg-accent/10 flex items-center justify-center transition-colors group-hover:bg-accent/20">
            <Landmark size={13} strokeWidth={1.5} className="text-accent" />
          </div>
          <span className="font-sans text-sm font-bold tracking-tight text-foreground">
            LandLedger
          </span>
        </Link>

        {/* Center: nav links */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-0.5">
          {NAV_LINKS.map(({ label, href }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1 rounded-lg text-xs font-medium font-sans transition-colors ${
                  active ? 'text-accent bg-accent/10' : 'text-muted hover:text-foreground hover:bg-surface/60'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right: theme + wallet + hamburger */}
        <div className="ml-auto flex items-center gap-1.5">
          {mounted && (
            <button
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface/60 transition-colors"
              aria-label="Toggle theme"
            >
              {resolvedTheme === 'dark'
                ? <Sun size={13} strokeWidth={1.5} />
                : <Moon size={13} strokeWidth={1.5} />}
            </button>
          )}

          {/* Desktop wallet — hidden below sm */}
          <div className="hidden sm:block">
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openConnectModal, mounted: rkMounted }) => {
                const connected = rkMounted && account && chain;
                return (
                  <div aria-hidden={!rkMounted} style={!rkMounted ? { opacity: 0, pointerEvents: 'none', userSelect: 'none' } : {}}>
                    {!connected ? (
                      <button
                        onClick={openConnectModal}
                        className="flex items-center gap-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold font-sans px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Connect Wallet
                      </button>
                    ) : (
                      <button
                        onClick={openAccountModal}
                        className="flex items-center gap-1.5 border border-border/60 bg-surface/60 hover:bg-surface text-foreground text-xs font-medium font-sans px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        {account.ensAvatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={account.ensAvatar} alt="" className="w-4 h-4 rounded-full" />
                          : <div className="w-4 h-4 rounded-full bg-accent/30 flex-shrink-0" />}
                        <span className="max-w-[80px] truncate">{account.displayName}</span>
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>

          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="md:hidden p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-surface/60 transition-colors"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>
      </div>

      {/* ── Mobile drawer — grid-rows collapses real height; opacity handles fade ── */}
      <div className={`md:hidden max-w-5xl mx-auto grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
      }`}>
        <div className="overflow-hidden">
          <div className="mt-1 rounded-2xl border border-border/60 bg-background/98 backdrop-blur-md shadow-lg shadow-black/20">

            {/* Nav links */}
            <div className="px-2 pt-2 pb-1 space-y-0.5">
              {NAV_LINKS.map(({ label, href, Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium font-sans transition-colors group ${
                      active ? 'text-accent bg-accent/10' : 'text-muted hover:text-foreground hover:bg-surface/60'
                    }`}
                  >
                    <Icon
                      size={16}
                      strokeWidth={active ? 2 : 1.5}
                      className={active ? 'text-accent' : 'text-muted group-hover:text-foreground transition-colors'}
                    />
                    <span className="flex-1">{label}</span>
                    {active
                      ? <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                      : <ChevronRight size={13} className="text-muted/40 group-hover:text-muted transition-colors" />}
                  </Link>
                );
              })}
            </div>

            {/* Divider */}
            <div className="mx-3 border-t border-border/60" />

            {/* Wallet section */}
            <div className="px-3 py-3">
              <ConnectButton.Custom>
                {({ account, chain, openAccountModal, openConnectModal, mounted: rkMounted }) => {
                  const connected = rkMounted && account && chain;
                  return (
                    <div aria-hidden={!rkMounted} style={!rkMounted ? { opacity: 0, pointerEvents: 'none', userSelect: 'none' } : {}}>
                      {!connected ? (
                        <button
                          onClick={openConnectModal}
                          className="w-full flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold font-sans px-4 py-2.5 rounded-xl transition-colors"
                        >
                          <Wallet size={15} />
                          Connect Wallet
                        </button>
                      ) : (
                        <button
                          onClick={openAccountModal}
                          className="w-full flex items-center gap-3 border border-border/60 bg-surface/60 hover:bg-surface text-foreground text-sm font-medium font-sans px-3 py-2.5 rounded-xl transition-colors"
                        >
                          {account.ensAvatar
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={account.ensAvatar} alt="" className="w-7 h-7 rounded-full" />
                            : (
                              <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center flex-shrink-0">
                                <div className="w-2 h-2 rounded-full bg-accent" />
                              </div>
                            )}
                          <div className="flex-1 text-left min-w-0">
                            <div className="text-xs text-muted leading-none mb-0.5">Connected</div>
                            <div className="text-sm font-medium truncate">{account.displayName}</div>
                          </div>
                          <div className="w-2 h-2 rounded-full bg-success flex-shrink-0" />
                        </button>
                      )}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>

          </div>
        </div>
      </div>

    </nav>
  );
}
