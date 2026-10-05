import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cloaflow — AI Voice Agent",
    short_name: "Cloaflow",
    description:
      "AI receptionist that answers calls, books appointments, takes orders and speaks 8+ languages.",
    start_url: "/",
    display: "standalone",
    background_color: "#07080f",
    theme_color: "#5464fb",
    icons: [],
  };
}
