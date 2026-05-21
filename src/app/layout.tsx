import type { Metadata } from "next";
import { Manrope, Noto_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ReactNode } from "react";
import { Providers } from "./providers";
import SmoothScroll from "@/src/components/SmoothScroll";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["300", "400", "500", "600", "700"],
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-noto-serif",
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LandLedger – Pakistan's Blockchain Land Registry",
  description:
    "Pakistan's first blockchain-based Land Registry for DHA, Bahria Town, and new housing societies. Cryptographically unforgeable plot ownership on Ethereum.",
  keywords: ["land registry", "blockchain", "Pakistan", "DHA", "Bahria Town", "property records", "NFT"],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${notoSerif.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>
        <Providers>
          <SmoothScroll>{children}</SmoothScroll>
        </Providers>
      </body>
    </html>
  );
}
