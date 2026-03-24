import { motion } from "framer-motion";

const integrations = ["Xero", "QuickBooks", "NetSuite", "Aave", "Curve", "Uniswap", "Lido", "Compound"];

const Integrations = () => {
  return (
    <section className="py-16 border-y border-border/50">
      <div className="container max-w-6xl mx-auto px-6">
        <p className="text-center font-mono text-xs tracking-[0.2em] uppercase text-muted-foreground mb-8">
          Integrated with the tools you already use
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
          {integrations.map((name, i) => (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="px-5 py-2.5 rounded-lg border border-border bg-card text-sm text-muted-foreground font-medium hover:border-primary/30 hover:text-foreground transition-all duration-300"
            >
              {name}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Integrations;
