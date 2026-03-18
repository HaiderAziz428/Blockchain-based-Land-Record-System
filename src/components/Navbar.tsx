import { Landmark } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 flex justify-between items-center px-6 md:px-12 py-4 border-b border-white/5 bg-[#0a0b1e]/80 backdrop-blur-xl">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
          <Landmark className="text-white" size={20} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-base font-extrabold tracking-tight uppercase text-white">LandLedger</span>
          <span className="text-[9px] text-indigo-400 font-semibold tracking-[0.18em] uppercase">Pakistan Land Registry</span>
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
            className="hover:text-white transition-colors duration-200 relative hover:after:w-full after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-0 after:h-px after:bg-indigo-400 after:transition-all after:duration-300"
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