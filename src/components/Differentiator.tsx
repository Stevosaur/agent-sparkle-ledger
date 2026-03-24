import { motion } from "framer-motion";

const Differentiator = () => {
  return (
    <section className="py-24 border-y border-border">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-16 md:gap-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <span className="text-xs text-muted-foreground uppercase tracking-widest block mb-4">
              [why axiom]
            </span>
            <h2 className="font-display text-4xl md:text-5xl font-bold tracking-tighter leading-[0.95]">
              not another
              <br />
              accounting firm<span className="text-primary">.</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="space-y-8"
          >
            <div className="border-l-2 border-primary pl-6">
              <h3 className="text-sm font-semibold mb-2">AI-first, human-verified</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Our agents do the heavy lifting — classification, reconciliation, reporting.
                Experienced CPAs review every output. You get speed and accuracy.
              </p>
            </div>
            <div className="border-l-2 border-border pl-6 hover:border-primary transition-colors">
              <h3 className="text-sm font-semibold mb-2">Built for crypto complexity</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                DeFi, DAOs, multi-chain, multi-entity. We handle the edge cases that
                traditional firms can't even parse.
              </p>
            </div>
            <div className="border-l-2 border-border pl-6 hover:border-primary transition-colors">
              <h3 className="text-sm font-semibold mb-2">10x cost efficiency</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                AI agents replace armies of junior accountants. You get enterprise-grade
                financial ops at a fraction of the cost.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Differentiator;
