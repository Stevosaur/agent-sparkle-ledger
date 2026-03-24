import { motion } from "framer-motion";
import {
  BookOpen, RefreshCw, Layers, BarChart3, Shield,
  Users, Building2, Rocket, Coins, Plug
} from "lucide-react";

const services = [
  { icon: BookOpen, title: "Month-End Close", desc: "Automated close for month, quarter, and year-end." },
  { icon: RefreshCw, title: "Reconciliation", desc: "Exchange, custody & bank reconciliation." },
  { icon: Layers, title: "DeFi Accounting", desc: "Across 50+ protocols — automated." },
  { icon: BarChart3, title: "Treasury Ops", desc: "Treasury operations & runway modeling." },
  { icon: Shield, title: "Compliance", desc: "Regulatory compliance across 10+ jurisdictions." },
  { icon: Users, title: "Fractional CFO", desc: "Strategic financial leadership on demand." },
  { icon: Building2, title: "Corp Admin", desc: "Corporate administration & governance." },
  { icon: Rocket, title: "Pre-TGE Setup", desc: "Financial infrastructure before launch." },
  { icon: Coins, title: "DAO & Grants", desc: "Grants & DAO operations management." },
  { icon: Plug, title: "Integrations", desc: "Seamless accounting software sync." },
];

const Services = () => {
  return (
    <section id="services" className="py-24 relative">
      <div className="container max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="font-mono text-xs tracking-[0.2em] uppercase text-primary mb-4 block">
            One Partner. Every Service.
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            Full-Service Crypto
            <br />
            Financial Operations
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {services.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04, duration: 0.4 }}
              className="group p-5 rounded-xl border border-border bg-card hover:border-primary/30 hover:glow-sm transition-all duration-300"
            >
              <s.icon className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-display text-sm font-semibold mb-1">{s.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Services;
