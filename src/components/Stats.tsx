import { motion } from "framer-motion";

const stats = [
  { value: "$2B+", label: "value supported" },
  { value: "100+", label: "protocols served" },
  { value: "50+", label: "chains covered" },
  { value: "10x", label: "faster close" },
];

const Stats = () => {
  return (
    <section className="border-y border-border py-16">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-border">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="md:px-8 first:md:pl-0 last:md:pr-0"
            >
              <div className="font-display text-4xl md:text-5xl font-bold text-primary text-glow mb-2">
                {stat.value}
              </div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
