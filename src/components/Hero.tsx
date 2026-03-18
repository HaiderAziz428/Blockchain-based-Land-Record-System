import { Shield, Database, Zap, Landmark, ArrowRight } from "lucide-react";

export default function Hero() {
  const stats = [
    { label: "Properties Registered", value: "50K+" },
    { label: "Active Users", value: "25K+" },
    { label: "Transactions", value: "100%" },
    { label: "System Uptime", value: "24/7" },
  ];

  const features = [
    { icon: Zap, label: "Secure Transactions", color: "text-indigo-400" },
    { icon: Database, label: "Immutable Data", color: "text-indigo-400" },
    { icon: Landmark, label: "Government Verified", color: "text-indigo-400" },
  ];

  return (
    <section className="flex flex-col items-center justify-center text-center px-6 py-24 min-h-[calc(100vh-64px)]">

      {/* Badge */}
      <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 text-gray-400 px-4 py-1.5 rounded-full text-xs font-medium mb-8 tracking-wide">
        <Shield size={13} className="text-indigo-400" />
        Secured by Blockchain Technology
      </div>

      {/* Heading */}
      <h1 className="text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight mb-5 max-w-2xl text-white">
        Blockchain Based Land Records
      </h1>

      {/* Subheading */}
      <p className="text-gray-500 text-base mb-10 max-w-md leading-relaxed">
        Pakistan&apos;s first blockchain-based Land Registry. Secure, transparent,
        and immutable property records for everyone.
      </p>

      {/* Feature pills — minimal, consistent */}
      <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-3 mb-10 text-sm text-gray-400">
        {features.map(({ icon: Icon, label }, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Icon size={14} className="text-indigo-400 flex-shrink-0" />
            <span>{label}</span>
            {i < features.length - 1 && (
              <span className="ml-6 hidden md:inline-block w-px h-3 bg-white/10" />
            )}
          </div>
        ))}
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-wrap justify-center gap-3 mb-20">
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 transition-colors px-7 py-2.5 rounded-lg text-sm font-semibold text-white">
          Get Started <ArrowRight size={15} />
        </button>
        <button className="bg-white/5 border border-white/10 hover:bg-white/[0.08] transition-colors px-7 py-2.5 rounded-lg text-sm font-semibold text-gray-300">
          Learn More
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl">
        {stats.map((stat, i) => (
          <div
            key={i}
            className="bg-white/[0.03] border border-white/[0.07] p-5 rounded-2xl text-left"
          >
            <p className="text-2xl font-bold text-white mb-0.5">{stat.value}</p>
            <p className="text-gray-500 text-xs">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}