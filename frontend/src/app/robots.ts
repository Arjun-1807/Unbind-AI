import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Signed-in surfaces. Nothing here is reachable without a session, so
      // crawling them only ever yields a redirect — and an analysis URL carries
      // an id that has no business in an index.
      disallow: ["/dashboard", "/upload", "/analysis", "/profile", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
