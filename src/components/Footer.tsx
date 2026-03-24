import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const Footer = () => {
  return (
    <footer className="border-t border-border/50">
      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-radial-hero opacity-50" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-10 container max-w-3xl mx-auto px-6 text-center"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight mb-4">
            Ready to fix your
            <br />
            <span className="text-gradient-primary">crypto books?</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join protocols, DAOs, and funds that trust Axiom for their financial operations.
          </p>
          <Button size="lg" className="font-semibold text-base px-10 glow-sm">
            Book a Demo
          </Button>
        </motion.div>
      </section>

      {/* Bottom bar */}
      <div className="border-t border-border/50 py-8">
        <div className="container max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="font-mono text-sm text-muted-foreground">
            © 2026 axiom. All rights reserved.
          </span>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
