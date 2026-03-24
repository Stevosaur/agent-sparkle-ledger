import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Integrations from "@/components/Integrations";
import Services from "@/components/Services";
import HowItWorks from "@/components/HowItWorks";
import Pricing from "@/components/Pricing";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Integrations />
      <Services />
      <HowItWorks />
      <Pricing />
      <Footer />
    </div>
  );
};

export default Index;
