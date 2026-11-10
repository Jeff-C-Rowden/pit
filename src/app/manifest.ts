import type { MetadataRoute } from "next";

/** PWA manifest so Pit installs like an app on phones. Name keeps the sandbox label honest. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pit — Private Tables (sandbox chips)",
    short_name: "Pit",
    description: "21+ sandbox casino demo. Test chips only, no real money. Not a licensed operator.",
    id: "/",
    start_url: "/floor",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#3a0306",
    theme_color: "#6a0710",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icons/pit-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/pit-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/pit-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
