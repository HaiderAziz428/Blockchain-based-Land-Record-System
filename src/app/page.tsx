import Navbar from "@/src/components/Navbar";
import Hero from "@/src/components/Hero";
import HowItWorks from "@/src/components/HowItWorks";
import Features from "@/src/components/Features";
import PortalSelection from "@/src/components/PortalSelection";
import CtaSection from "@/src/components/CtaSection";
import Footer from "@/src/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <Navbar />
      <main className="home-stagger">
        <Hero />
        <HowItWorks />
        <Features />
        <PortalSelection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}
