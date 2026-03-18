import { Landmark, Mail, Phone, MapPin, ExternalLink } from "lucide-react";

export default function Footer() {
  const links = {
    "Quick Links": [
      { label: "About Us", href: "#" },
      { label: "Services", href: "#" },
      { label: "Properties", href: "#" },
      { label: "Contact", href: "#" },
    ],
    "Resources": [
      { label: "How It Works", href: "#" },
      { label: "FAQs", href: "#" },
      { label: "Support", href: "#" },
      { label: "Documentation", href: "#" },
    ],
  };

  return (
    <footer className="relative mt-16 border-t border-white/5 bg-[#06070f]/80 backdrop-blur-md">
      {/* Top glow line */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />

      <div className="max-w-6xl mx-auto px-6 md:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-xl">
                <Landmark className="text-white" size={18} />
              </div>
              <span className="font-extrabold tracking-tight uppercase text-white">LandLedger</span>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed mb-5">
              Pakistan&apos;s first blockchain-based land registry. Secure, transparent, and government-backed property records.
            </p>
           
          </div>

          {/* Link Columns */}
          {Object.entries(links).map(([title, items]) => (
            <div key={title}>
              <h5 className="font-bold mb-5 text-xs uppercase tracking-widest text-indigo-400">{title}</h5>
              <ul className="space-y-3">
                {items.map(({ label, href }) => (
                  <li key={label}>
                    <a
                      href={href}
                      className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 group"
                    >
                      <span className="w-0 group-hover:w-3 h-px bg-indigo-400 transition-all duration-200" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact */}
          <div>
            <h5 className="font-bold mb-5 text-xs uppercase tracking-widest text-indigo-400">Contact</h5>
            <ul className="space-y-3.5 text-sm text-gray-500">
              <li className="flex items-start gap-2.5">
                <MapPin size={15} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <span>Land Registry Office,<br />Islamabad, Pakistan</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail size={15} className="text-indigo-400 flex-shrink-0" />
                <a href="mailto:info@landledger.gov.pk" className="hover:text-white transition-colors">
                  info@landledger.gov.pk
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone size={15} className="text-indigo-400 flex-shrink-0" />
                <span>+92 (51) 123-4567</span>
              </li>
              <li>
                <a
                  href="#"
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-1"
                >
                  <ExternalLink size={12} /> View on Block Explorer
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <span>© 2025 LandLedger. A Government of Pakistan Initiative. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-gray-400 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-gray-400 transition-colors">Terms of Use</a>
          </div>
        </div>
      </div>
    </footer>
  );
}