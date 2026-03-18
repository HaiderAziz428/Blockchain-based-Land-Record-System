import Navbar from "@/src/components/Navbar";
import Hero from "@/src/components/Hero";
import PortalSelection from "@/src/components/PortalSelection";
import Footer from "@/src/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen text-white relative overflow-hidden">

      <Navbar />

      <main className="relative z-10">
        <Hero />
        <PortalSelection />
      </main>

      <Footer />
    </div>
  );
}