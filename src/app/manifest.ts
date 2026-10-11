import type { MetadataRoute } from "next";
import { site } from "@/lib/config/site";

/** Web app manifest (the Android / iOS apps wrap this same site). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${site.name} — Singapore property research`,
    short_name: site.name,
    description: site.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#19625b",
    lang: "en-SG",
    categories: ["finance", "lifestyle", "utilities"],
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
