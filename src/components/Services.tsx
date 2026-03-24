import { motion } from "framer-motion";

const services = [
  {
    id: "01",
    title: "Month-End Close",
    desc: "AI agents classify, reconcile, and close your books every month. Human CPAs review every output before delivery.",
  },
  {
    id: "02",
    title: "DeFi Accounting",
    desc: "Automated tracking across 50+ protocols. Yield farming, LP positions, staking rewards — all accounted for.",
  },
  {
    id: "03",
    title: "Treasury Operations",
    desc: "Real-time treasury visibility. Runway modeling. Multi-chain, multi-entity, multi-currency.",
  },
  {
    id: "04",
    title: "Regulatory Compliance",
    desc: "Filing prep across 10+ jurisdictions. Stay ahead of evolving crypto regulations without the overhead.",
  },
  {
    id: "05",
    title: "Fractional CFO",
    desc: "Strategic financial leadership embedded in your team. Board decks, fundraising support, financial modeling.",
  },
  {
    id: "06",
    title: "Corporate Admin",
    desc: "Entity formation, governance, pre-TGE infrastructure. The operational backbone your project needs.",
  },
];

const Services = () => {
  return (
    <section className="py-24">
      <div className="max-w-[1400px] mx-auto px-6">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-16"
        >
          <span className="text-xs text-muted-foreground uppercase tracking-widest block mb-4">
            [services]
          </span>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tighter">
            everything your
            <br />
            back office needs<span className="text-primary">.</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-border">
          {services.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.4 }}
              className="bg-background p-8 group hover:bg-card transition-colors duration-300"
            >
              <span className="text-xs text-primary font-mono block mb-4">{s.id}</span>
              <h3 className="font-display text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                {s.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
