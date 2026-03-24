import { motion } from "framer-motion";

const Footer = () => {
  return (
    <footer className="border-t border-border">
      {/* CTA */}
      <section className="py-24">
        <div className="max-w-[1400px] mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-4xl md:text-7xl font-bold tracking-tighter leading-[0.9] mb-8">
              ready to close
              <br />
              your books<span className="text-primary text-glow">?</span>
            </h2>
            <a
              href="mailto:hello@heshi.ai"
              className="inline-block text-sm border border-primary bg-primary text-primary-foreground px-8 py-3 uppercase tracking-widest hover:bg-primary/90 transition-colors"
            >
              Book a Demo
            </a>
          </motion.div>
        </div>
      </section>

      {/* Bottom */}
      <div className="border-t border-border py-6">
        <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <span className="text-[11px] text-muted-foreground">
            © 2026 kuai<span className="text-primary">_</span> all rights reserved.
          </span>
          <div className="flex gap-6 text-[11px] text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">privacy</a>
            <a href="#" className="hover:text-primary transition-colors">terms</a>
            <a href="#" className="hover:text-primary transition-colors">twitter</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
