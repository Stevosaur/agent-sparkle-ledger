import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const Navbar = () => {
  const links = ["Services", "Pricing", "About", "Case Studies"];

  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 backdrop-blur-xl bg-background/70"
    >
      <div className="container flex items-center justify-between h-16 max-w-6xl mx-auto px-6">
        <a href="/" className="font-mono text-lg font-semibold tracking-tight text-foreground">
          axiom<span className="text-gradient-primary">.</span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          {links.map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase().replace(" ", "-")}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {link}
            </a>
          ))}
        </div>
        <Button size="sm" className="font-medium">
          Book a Demo
        </Button>
      </div>
    </motion.nav>
  );
};

export default Navbar;
