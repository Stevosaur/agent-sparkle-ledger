import { motion } from "framer-motion";

const plans = [
  {
    name: "Starter",
    price: "$2,000",
    desc: "Early-stage crypto companies getting their books in order.",
    features: ["Month-end close", "Basic reconciliation", "1 entity", "Xero / QBO integration", "Email support"],
    popular: false,
  },
  {
    name: "Growth",
    price: "$5,000",
    desc: "Scaling protocols and funds with complex DeFi activity.",
    features: [
      "Everything in Starter",
      "DeFi position tracking",
      "Treasury reporting",
      "Up to 3 entities",
      "Regulatory filing prep",
      "Dedicated accountant",
      "Slack channel",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    price: "$10,000+",
    desc: "Full-service crypto financial operations with a dedicated team.",
    features: [
      "Everything in Growth",
      "Fractional CFO",
      "Corp administration",
      "Pre-launch setup",
      "Grants & DAO ops",
      "Unlimited entities",
      "Custom integrations",
    ],
    popular: false,
  },
];

const Pricing = () => {
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
            [pricing]
          </span>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tighter">
            fixed monthly plans<span className="text-primary">.</span>
            <br />
            no surprises<span className="text-primary">.</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-px bg-border">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`bg-background p-8 flex flex-col ${
                plan.popular ? "bg-card" : ""
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider">{plan.name}</h3>
                {plan.popular && (
                  <span className="text-[10px] text-primary border border-primary/30 px-2 py-0.5 uppercase tracking-widest">
                    popular
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-6">{plan.desc}</p>
              
              <div className="mb-8">
                <span className="font-display text-4xl font-bold">{plan.price}</span>
                <span className="text-xs text-muted-foreground">/mo</span>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-secondary-foreground flex items-center gap-2">
                    <span className="text-primary text-[10px]">→</span>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="#"
                className={`block text-center text-xs uppercase tracking-widest py-3 border transition-all duration-300 ${
                  plan.popular
                    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border hover:border-primary hover:text-primary"
                }`}
              >
                {plan.name === "Enterprise" ? "Contact Us" : "Get Started"}
              </a>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
