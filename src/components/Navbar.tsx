import { motion } from "framer-motion";

const Navbar = () => {
  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/90 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between h-12 px-6 max-w-[1400px] mx-auto">
        <a href="/" className="text-sm font-semibold tracking-tight text-foreground">
          axiom<span className="text-primary">_</span>
        </a>
        <a
          href="mailto:hello@axiom.co"
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          hello@axiom.co
        </a>
      </div>
    </motion.nav>
  );
};

export default Navbar;
