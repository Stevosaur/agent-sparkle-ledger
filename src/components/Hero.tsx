import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-radial-hero">
      {/* Grid background */}
      <div className="absolute inset-0 bg-grid opacity-30" />
      
      {/* Glow orb */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[120px] animate-pulse-glow" />

      <div className="relative z-10 container max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <span className="inline-block font-mono text-xs tracking-[0.2em] uppercase text-primary mb-6 border border-primary/20 rounded-full px-4 py-1.5">
            AI-Native Crypto Accounting
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35 }}
          className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
        >
          Your crypto books.
          <br />
          <span className="text-gradient-primary">Closed by AI.</span>
          <br />
          Reviewed by humans.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Axiom combines AI agents with experienced accountants to deliver accurate,
          timely financials — 10x faster, at a fraction of the cost.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.65 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button size="lg" className="font-semibold text-base px-8 glow-sm">
            Book a Demo
          </Button>
          <Button variant="outline" size="lg" className="font-semibold text-base px-8 border-border hover:bg-secondary">
            Explore Services
          </Button>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
