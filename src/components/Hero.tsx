import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const lines = [
  "$ kuai init --connect wallets exchanges",
  "> scanning 47 wallets across 12 chains...",
  "> classifying 23,841 transactions...",
  "> reconciling DeFi positions on Aave, Curve, Uniswap...",
  "> generating month-end close...",
  "> ✓ books closed. 0 discrepancies. ready for review.",
];

const TerminalLine = ({ text, delay }: { text: string; delay: number }) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      let i = 0;
      const interval = setInterval(() => {
        if (i <= text.length) {
          setDisplayed(text.slice(0, i));
          i++;
        } else {
          setDone(true);
          clearInterval(interval);
        }
      }, 18);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timeout);
  }, [text, delay]);

  const isCommand = text.startsWith("$");
  const isSuccess = text.includes("✓");

  return (
    <div className={`text-xs md:text-sm leading-relaxed ${
      isCommand ? "text-foreground" : isSuccess ? "text-primary text-glow" : "text-muted-foreground"
    }`}>
      {displayed}
      {!done && <span className="cursor-blink text-primary">▋</span>}
    </div>
  );
};

const Hero = () => {
  return (
    <section className="min-h-screen flex flex-col justify-center relative scanline">
      <div className="max-w-[1400px] mx-auto px-6 w-full pt-24">
        {/* Main headline */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="font-display text-[clamp(3rem,8vw,8rem)] font-bold leading-[0.9] tracking-tighter mb-8">
            your crypto
            <br />
            books<span className="text-primary text-glow">.</span> closed
            <br />
            by machines<span className="text-primary text-glow">.</span>
          </h1>
        </motion.div>

        {/* Sub text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-sm md:text-base text-muted-foreground max-w-xl leading-relaxed mb-16"
        >
          Axiom deploys AI agents alongside human accountants to close your
          books faster, cheaper, and more accurately than any traditional firm.
          From month-end close to fractional CFO — we run your entire back office.
        </motion.p>

        {/* Terminal */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="border border-border bg-card p-6 max-w-2xl"
        >
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
            <div className="w-2 h-2 bg-primary/60" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">axiom agent v2.4</span>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <TerminalLine key={i} text={line} delay={1200 + i * 1400} />
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
