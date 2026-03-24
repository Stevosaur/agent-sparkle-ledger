import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$2,000",
    desc: "For early-stage crypto companies getting their books in order.",
    features: ["Month-end close", "Basic reconciliation", "1 entity", "Xero or QBO integration", "Email support"],
    cta: "Get Started",
    popular: false,
  },
  {
    name: "Growth",
    price: "$5,000",
    desc: "For scaling protocols and funds with complex DeFi activity.",
    features: [
      "Everything in Starter",
      "DeFi position tracking",
      "Treasury reporting",
      "Up to 3 entities",
      "Regulatory filing prep",
      "Dedicated accountant",
      "Slack support channel",
    ],
    cta: "Get Started",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "$10,000+",
    desc: "Full-service crypto financial ops with a dedicated team.",
    features: [
      "Everything in Growth",
      "Fractional CFO",
      "Corporate administration",
      "Pre-launch setup",
      "Grants & DAO operations",
      "Unlimited entities",
      "Custom integrations",
      "Dedicated team",
    ],
    cta: "Contact Us",
    popular: false,
  },
];

const Pricing = () => {
  return (
    <section id="pricing" className="py-24 relative">
      <div className="container max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            Simple, transparent pricing
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Fixed monthly plans. No hourly billing surprises.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`relative rounded-2xl border p-8 flex flex-col ${
                plan.popular
                  ? "border-primary/40 bg-card glow-md"
                  : "border-border bg-card"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 font-mono text-xs tracking-wider uppercase bg-primary text-primary-foreground px-4 py-1 rounded-full font-semibold">
                  Most Popular
                </span>
              )}
              <h3 className="font-display text-xl font-semibold">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-6">{plan.desc}</p>
              <div className="mb-6">
                <span className="font-display text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-secondary-foreground">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className={`w-full font-semibold ${plan.popular ? "glow-sm" : ""}`}
                variant={plan.popular ? "default" : "outline"}
              >
                {plan.cta}
              </Button>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-10">
          All plans include onboarding, data migration support, and access to our client portal.{" "}
          <a href="#" className="text-primary hover:underline">Need something custom?</a>
        </p>
      </div>
    </section>
  );
};

export default Pricing;
