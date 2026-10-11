import { defineConfig } from "@vercel/geistdocs/config";
import { repositoryIsPublic, siteName, siteUrl } from "@/lib/site";

export const config = defineConfig({
  title: siteName,
  siteUrl,
  defaultLanguage: "en",
  logo: <span className="font-medium tracking-tight">{siteName}</span>,
  logoHref: "/",
  navbarVariant: "oss",
  navbarBrand: "labs",
  navbarActiveProduct: siteName,
  navbarGithub: { enabled: true },
  github: {
    owner: "edmundmiller",
    repo: "issue-graph",
    branch: "main",
    editPath: "apps/docs/content/docs",
  },
  content: [{ id: "docs", label: "Documentation", dir: "content/docs", route: "/docs" }],
  nav: [
    { label: "Docs", href: "/docs" },
    {
      label: "Fork setup",
      href: "https://github.com/edmundmiller/issue-graph#start-here",
      external: true,
    },
  ],
  ai: { enabled: false },
  feedback: { enabled: false },
  language: { enabled: false },
  search: { enabled: true },
  pageActions: { askAI: false, openInChat: false, editSource: repositoryIsPublic },
  webmcp: { enabled: true },
});
