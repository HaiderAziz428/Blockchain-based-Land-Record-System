import type { Metadata } from "next";
import { Inter, Poppins } from 'next/font/google';
import Header from "../components/Header";
import "./globals.css";
import { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Land Record System",
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500'],
});

const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-heading',
  weight: ['400', '600', '700'],
});

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${poppins.variable}`}
        suppressHydrationWarning
      >
        <Providers>
          <Header/>
          {children}
        </Providers>
      </body>
    </html>
  );
}