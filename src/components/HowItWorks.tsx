import { motion } from "framer-motion";

const steps = [
  {
    num: "01",
    title: "Connect",
    desc: "Link your wallets, exchanges, and accounting software. Read-only API keys — we never touch your funds.",
  },
  {
    num: "02",
    title: "Automate",
    desc: "AI agents classify transactions, reconcile balances, and prepare your books — continuously.",
  },
  {
    num: "03",
    title: "Review & Close",
    desc: "Human accountants review every output. You get accurate financials, on time, every month.",
  },
];

const HowItWorks = () => {
  return (
    <section className="py-24 border-y border-border/50 relative">
      <div className="container max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            How it works
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Three steps to accurate, on-time crypto financials.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="relative"
            >
              <span className="font-mono text-5xl font-bold text-gradient-primary opacity-60 block mb-4">
                {step.num}
              </span>
              <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
