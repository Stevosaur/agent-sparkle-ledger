import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import Services from "@/components/Services";
import Differentiator from "@/components/Differentiator";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background noise">
      <Navbar />
      <Hero />
      <Stats />
      <Services />
      <Differentiator />
      <Pricing />
      <Footer />
    </div>
  );
};

export default Index;
