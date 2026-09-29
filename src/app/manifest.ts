import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PasarCatch AI",
    short_name: "PasarCatch",
    description: "The AI supply operating system for Singapore's seafood trade.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#07090d",
    theme_color: "#07090d",
    orientation: "portrait",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "Receive a lot", url: "/receive" },
      { name: "Declare catch", url: "/supplier" },
      { name: "Tonight's Market", url: "/market" },
    ],
  };
}
