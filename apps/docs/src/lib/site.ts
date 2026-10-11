export const siteName = "issue-graph";
export const siteUrl = "https://issue-graph.dev";
export const repositoryUrl = "https://github.com/edmundmiller/issue-graph";
export const siteDescription =
  "Find related issues, competing changes, and unresolved follow-ups before you start work. A CLI for maintainers and coding agents.";
export const repositoryIsPublic = true;
export const plannedInstallCommand = "git clone https://github.com/edmundmiller/issue-graph.git";
export const agentSetupPrompt = "npx skills@latest add edmundmiller/issue-graph";
export const exampleCommand =
  "issue-graph 1113 --repo vercel-labs/agent-browser --depth 1 --max-nodes 12 --no-snapshot";
export const exampleRerunCommand =
  "issue-graph graph vercel-labs/agent-browser#1113 --depth 1 --budget 12 --no-save";
export const isPreview = process.env.VERCEL_ENV === "preview";

export function canonicalUrl(pathname = "/") {
  return new URL(pathname, siteUrl).toString();
}
