import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Self Financial — AI Spending Tracker",
    short_name: "Self Financial",
    description:
      "Log daily VND expenses in plain text and automatically categorize into Must have, Nice to have, and Wasted with Gemini AI.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f9",
    theme_color: "#047857",
    categories: ["finance", "productivity", "utilities"],
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
