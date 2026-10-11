import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { beadsModel } from "./beads.js";
import type { Model } from "./html.js";
import { parseModel } from "./model-validation.js";
import { collectProvider, providerScope, type WorkProvider } from "./providers.js";
import { QueryUsageError } from "./query-cli.js";
import { writeDashboardModel } from "./snapshot.js";

export const PROVIDER_HELP = `usage: issue-graph open <jira:PROJECT|linear:PROJECT_UUID|notion:DATA_SOURCE_UUID|beads:PROJECT> [options]

Read-only collection into the normalized dashboard model. JSON stdout by default.
  --state open|all       default open (unclosed, not necessarily ready)
  --budget N             item limit, 1..1000 (default 1000)
  --max-pages N          inventory page limit, 1..1000 (default 100)
  --status-property NAME Notion status/select property (default Status)
  --closed-status NAME   Notion completed option; repeatable (default Done)
  --input PATH           Beads tracked JSONL (default .beads/issues.jsonl)
  --format json|human    JSON model or summary
  -o, --out PATH         export normalized model JSON (not GitHub graph JSON)
  --no-save              do not replace the saved dashboard run
  --no-open              accepted; collection does not launch a browser
  -h, --help             show help without credentials

Jira: JIRA_URL=https://site.atlassian.net, JIRA_EMAIL, JIRA_API_TOKEN (unscoped API token).
Linear: LINEAR_API_KEY (personal key) or LINEAR_ACCESS_TOKEN (OAuth).
Notion: NOTION_API_TOKEN; share the task data source with the integration.
Beads: compatible issue JSONL from br/bd; neither binary is required or invoked.
JSONL can lag database-backed changes until exported/flushed; import never mutates it.
Use query <provider:scope> or dashboard after collection to explore the saved model.
Exit 0: complete visible inventory; 1: incomplete/read failure; 2: invalid arguments.`;

export function isProviderOpen(argv: string[]): boolean {
  return argv[0] === "open" && argv.some((arg) => /^(jira|linear|notion|beads):/.test(arg));
}

export async function runProviderOpen(
  argv: string[],
  env = process.env,
  fetch = globalThis.fetch,
): Promise<void> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        state: { type: "string" },
        budget: { type: "string" },
        "max-pages": { type: "string" },
        "status-property": { type: "string" },
        "closed-status": { type: "string", multiple: true },
        input: { type: "string" },
        format: { type: "string" },
        out: { type: "string", short: "o" },
        "no-save": { type: "boolean" },
        "no-open": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    throw new QueryUsageError(error instanceof Error ? error.message : String(error));
  }
  const v = args.values;
  if (v.help) {
    console.log(PROVIDER_HELP);
    return;
  }
  const match = /^(jira|linear|notion|beads):(.+)$/.exec(args.positionals[0] ?? "");
  if (!match || args.positionals.length !== 1) throw new QueryUsageError(PROVIDER_HELP);
  const provider = match[1] as WorkProvider | "beads";
  const scope = match[2];
  if (provider === "beads" && !/^[\w.-]+(?:\/[\w.-]+)*$/.test(scope))
    throw new QueryUsageError("Beads requires a stable project scope");
  const state = v.state ?? "open";
  if (state !== "open" && state !== "all") throw new QueryUsageError("--state must be open or all");
  if (v.format && v.format !== "json" && v.format !== "human")
    throw new QueryUsageError("--format must be json or human");
  if (v.out && !String(v.out).endsWith(".json"))
    throw new QueryUsageError("--out requires a .json model path; use query --open for HTML");
  if (v.input && provider !== "beads")
    throw new QueryUsageError("--input is only supported for Beads snapshots");
  if (provider !== "notion" && (v["status-property"] || v["closed-status"]))
    throw new QueryUsageError("Notion mapping flags require notion: scope");
  if (provider === "beads" && v["max-pages"])
    throw new QueryUsageError("--max-pages does not apply to JSONL snapshots");
  const budget = Number(v.budget ?? 1000);
  const maxPages = Number(v["max-pages"] ?? 100);
  for (const [name, value] of [
    ["budget", budget],
    ["max-pages", maxPages],
  ] as const)
    if (!Number.isInteger(value) || value < 1 || value > 1000)
      throw new QueryUsageError(`--${name} must be an integer from 1 to 1000`);
  let model: Model;
  if (provider === "beads") {
    try {
      model = beadsModel(readFileSync(String(v.input ?? ".beads/issues.jsonl"), "utf8"), {
        scope,
        state,
        budget,
      });
    } catch (error) {
      throw new Error(
        `Cannot import Beads snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else {
    try {
      providerScope({ provider, scope, site: env.JIRA_URL });
    } catch (error) {
      throw new QueryUsageError(error instanceof Error ? error.message : String(error));
    }
    const token =
      provider === "jira"
        ? env.JIRA_EMAIL && env.JIRA_API_TOKEN
          ? Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString("base64")
          : ""
        : provider === "linear"
          ? env.LINEAR_API_KEY ||
            (env.LINEAR_ACCESS_TOKEN ? `Bearer ${env.LINEAR_ACCESS_TOKEN}` : "")
          : (env.NOTION_API_TOKEN ?? "");
    if (!token)
      throw new Error(
        `Missing ${provider} credentials; run open ${provider}:${scope} --help for configuration`,
      );
    model = await collectProvider({
      provider,
      scope,
      token,
      site: env.JIRA_URL,
      state,
      budget,
      maxPages,
      fetch,
      statusProperty: v["status-property"] as string | undefined,
      closedStatuses: v["closed-status"] as string[] | undefined,
    });
  }
  parseModel(model);
  const json = `${JSON.stringify(model, null, 2)}\n`;
  if (v.out) writeFileSync(String(v.out), json, { mode: 0o600 });
  if (!v["no-save"]) writeDashboardModel(model.id ?? `${provider}:${scope}`, model);
  if (v.format === "human")
    console.log(
      `${model.provider.name}: ${model.label}\n${Object.keys(model.nodes).length} items, ${model.groups.length} groups; coverage ${model.coverage?.complete ? "complete" : "incomplete"}\nQuery scope: ${model.id}`,
    );
  else process.stdout.write(json);
  for (const warning of model.coverage?.warnings ?? []) console.error(warning);
  if (!model.coverage?.complete) process.exitCode = 1;
}
