'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  getDefaultWallets,
  getDefaultConfig,
  darkTheme,
  Theme,
} from '@rainbow-me/rainbowkit';

import {
  trustWallet,
  ledgerWallet,
} from '@rainbow-me/rainbowkit/wallets';
import {
  sepolia,
} from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http, fallback } from 'wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const { wallets } = getDefaultWallets();
// REPLACE THIS WITH YOUR OWN PROJECT ID FROM WALLETCONNECT.COM
// It is free. Go get one. Don't use 'YOUR_PROJECT_ID'
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID"; 

const config = getDefaultConfig({
  appName: 'LandLedger',
  projectId,
  chains: [sepolia],
  ssr: true, // 🚀 Enables perfect Server-Side Rendering & stops hydration errors
  transports: {
    [sepolia.id]: fallback([
        http('https://ethereum-sepolia.publicnode.com'),
        http('https://rpc2.sepolia.org'),
        http() // Default fallback
    ]),
  },
});

const myTheme: Theme = darkTheme({
  accentColor: '#4f46e5',
  accentColorForeground: '#ffffff',
  borderRadius: 'medium',
  fontStack: 'system',
  overlayBlur: 'small',
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={myTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}