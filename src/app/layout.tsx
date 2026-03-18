import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "LandLedger – Pakistan's Blockchain Land Registry",
  description:
    "Pakistan's first government-backed blockchain Land Registry. Secure, transparent, and immutable property records verified on-chain.",
  keywords: ["land registry", "blockchain", "Pakistan", "property records", "DApp", "government"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body
        style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif" }}
        suppressHydrationWarning
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}