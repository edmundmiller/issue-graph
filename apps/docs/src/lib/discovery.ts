import { markdownPath } from "./docs-paths";
import { geistdocsSource } from "./geistdocs/source";
import { canonicalUrl, siteDescription, siteName } from "./site";

export function documentationPages() {
  return geistdocsSource.source.getPages("en");
}

export function releaseNotice(): string {
  return "Install this fork from https://github.com/edmundmiller/issue-graph#start-here: clone, install locked dependencies with pnpm, pack, and install the local tarball. Node.js 24 LTS is recommended for builds. issue-graph@latest and issue-graph.dev select upstream, not this fork. Check schema for Jira, Linear, Notion, Beads and load skills get core --full. Beads JSONL and saved queries work offline; live providers require their own authorized credentials.";
}

export function llmsIndex(): string {
  return [
    `# ${siteName}`,
    "",
    `> ${siteDescription}`,
    "",
    releaseNotice(),
    "",
    "issue-graph reads GitHub data. It does not close issues, merge pull requests, or establish code correctness or merge readiness. Snapshots can write local files.",
    "",
    "## Documentation",
    "",
    ...documentationPages().map(
      (page) =>
        `- [${page.data.title}](${canonicalUrl(page.url)}): ${page.data.description ?? "Documentation"}`,
    ),
    "",
    "## Agent resources",
    "",
    `- [Release-compatible agent setup](${canonicalUrl("/docs/agents.md")})`,
    `- [Markdown sitemap](${canonicalUrl("/sitemap.md")})`,
    `- [XML sitemap](${canonicalUrl("/sitemap.xml")})`,
    "",
    "Request a page with Accept: text/markdown or append .md to a documentation URL. WebMCP is available in supporting browsers; ordinary navigation and search do not require it.",
    "",
  ].join("\n");
}

export function sitemapMarkdown(): string {
  return [
    `# ${siteName} sitemap`,
    "",
    `- [Home](${canonicalUrl("/")}): [Markdown](${canonicalUrl("/index.md")})`,
    ...documentationPages().map(
      (page) =>
        `- [${page.data.title}](${canonicalUrl(page.url)}): ${page.data.description ?? ""} [Markdown](${canonicalUrl(markdownPath(page.url))})`,
    ),
    `- [Release-compatible agent setup](${canonicalUrl("/docs/agents.md")})`,
    "",
  ].join("\n");
}
