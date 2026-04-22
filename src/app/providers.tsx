'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  Theme,
} from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http, fallback } from 'wagmi';
import '@rainbow-me/rainbowkit/styles.css';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

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

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
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