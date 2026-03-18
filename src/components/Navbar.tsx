import { Landmark } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 md:px-12 py-4 border-b border-white/[0.05] bg-[#0a0b1e]/90 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="bg-indigo-600 p-2 rounded-lg border border-indigo-500/50">
          <Landmark className="text-white" size={20} strokeWidth={1.5} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-base font-bold tracking-tight text-white">LandLedger</span>
          <span className="text-[10px] text-gray-400 font-medium tracking-wide">Government Records</span>
        </div>
      </div>

      {/* Nav Links */}
      <div className="hidden md:flex gap-8 text-sm font-medium text-gray-400">
        {[
          { label: "Home", href: "/" },
          { label: "Marketplace", href: "/marketplace" },
          { label: "Admin", href: "/admin" },
          { label: "User", href: "/user" },
        ].map(({ label, href }) => (
          <a
            key={label}
            href={href}
            className="text-gray-400 hover:text-white transition-opacity duration-200"
          >
            {label}
          </a>
        ))}
      </div>

      {/* Wallet Connect */}
      <div className="flex items-center">
        <ConnectButton
          accountStatus="avatar"
          chainStatus="icon"
          showBalance={false}
        />
      </div>
    </nav>
  );
}