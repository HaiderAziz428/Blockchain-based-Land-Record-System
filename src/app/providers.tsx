'use client';

import * as React from 'react';
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  lightTheme,
  type Theme,
} from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, http, fallback } from 'wagmi';
import { ThemeProvider, useTheme } from 'next-themes';
import '@rainbow-me/rainbowkit/styles.css';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';

const config = getDefaultConfig({
  appName: 'LandLedger',
  projectId,
  chains: [sepolia],
  ssr: true,
  transports: {
    [sepolia.id]: fallback([
      http('https://ethereum-sepolia.publicnode.com'),
      http('https://rpc2.sepolia.org'),
      http(),
    ]),
  },
});

const DEFAULT_THEME = 'light';

// Must live *inside* ThemeProvider so useTheme() resolves.
// Before mount, use DEFAULT_THEME so SSR and first paint match (avoids hydration flash).
function RainbowKitWithTheme({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const isLight = mounted ? resolvedTheme === 'light' : DEFAULT_THEME === 'light';

  const theme: Theme = isLight
      ? lightTheme({
          accentColor: '#15803d',
          accentColorForeground: '#ffffff',
          borderRadius: 'medium',
          fontStack: 'system',
          overlayBlur: 'small',
        })
      : darkTheme({
          accentColor: '#16a34a',
          accentColorForeground: '#ffffff',
          borderRadius: 'medium',
          fontStack: 'system',
          overlayBlur: 'small',
        });

  return <RainbowKitProvider theme={theme}>{children}</RainbowKitProvider>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  return (
    <ThemeProvider attribute="class" defaultTheme={DEFAULT_THEME} enableSystem={false}>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWithTheme>
            {children}
          </RainbowKitWithTheme>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
