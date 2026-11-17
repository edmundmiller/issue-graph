import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import base from "../../oxlint.config.ts";
import semantic from "../../oxlint.jev.config.ts";
import strict from "../../oxlint.strict.config.ts";
import core from "./anti-slop/index.ts";
import { martinFowlerJevRules } from "./anti-slop/martinfowler/jev-rules.ts";

const root = resolve(import.meta.dirname, "../..");
const scratch = join(root, ".amp/in/orb-backup");
mkdirSync(scratch, { recursive: true });

function fixture(run) {
  const dir = mkdtempSync(join(scratch, "lint-test-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function git(cwd, ...args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
  assert.equal(result.status, 0, result.stderr);
}

test("base preserves Biome and excludes semantic and Effect plugins", () => {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const docs = JSON.parse(readFileSync(join(root, "apps/docs/package.json"), "utf8"));
  assert.equal(manifest.devDependencies["@biomejs/biome"], "2.5.3");
  assert.equal(docs.devDependencies["@biomejs/biome"], "2.5.3");
  assert.equal(docs.scripts.lint, "biome check .");
  assert.match(manifest.scripts.lint, /^biome check src tests /);
  assert.equal(manifest.scripts.check, "pnpm lint && pnpm typecheck && pnpm test && pnpm build");
  assert.match(manifest.scripts["lint:strict"], /-c oxlint.strict.config.ts/);
  for (const name of ["lint", "lint:oxlint", "lint:strict", "check", "check:docs"]) {
    assert.doesNotMatch(manifest.scripts[name], /jev|lint:diff|check:full/);
  }
  assert.equal(manifest.devDependencies.oxlint, manifest.devDependencies["@oxlint/plugins"]);
  assert.deepEqual(
    base.jsPlugins.map(({ name }) => name),
    ["anti-slop-martinfowler"],
  );
  for (const id of Object.keys(core.rules)) {
    assert.equal(base.rules[`anti-slop/${id}`], undefined);
    const severity = strict.rules[`anti-slop/${id}`];
    assert.equal(Array.isArray(severity) ? severity[0] : severity, "error", id);
  }
  assert.equal(strict.rules["oxc/no-accumulating-spread"], "error");
  assert.equal(base.rules["anti-slop-martinfowler/message-chains"], "off");
  for (const { id } of martinFowlerJevRules) {
    const name = `anti-slop-martinfowler-jev/${id}`;
    assert.equal(base.rules[name], undefined);
    assert.equal(semantic.rules[name], "warn");
    assert.equal(semantic.overrides[0].rules[name], "off");
  }
});

test("registered Core plugin accepts typed access and rejects Reflect.get", () =>
  fixture((dir) => {
    const source = join(dir, "source.ts");
    const config = join(dir, "oxlint.json");
    writeFileSync(
      config,
      JSON.stringify({
        ...strict,
        ignorePatterns: [],
        jsPlugins: strict.jsPlugins.map((plugin) => ({
          ...plugin,
          specifier: resolve(root, plugin.specifier),
        })),
      }),
    );
    const lint = () =>
      spawnSync(
        process.execPath,
        [
          join(root, "node_modules/oxlint/bin/oxlint"),
          "--threads=2",
          "--no-ignore",
          "-c",
          config,
          "source.ts",
        ],
        { cwd: dir, encoding: "utf8" },
      );
    writeFileSync(source, "export const value = { count: 1 }.count;\n");
    const accepted = lint();
    assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
    writeFileSync(source, 'export const value = Reflect.get({ count: 1 }, "count");\n');
    const rejected = lint();
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.match(rejected.stdout + rejected.stderr, /no-reflect-get/);
    writeFileSync(
      source,
      "export const values = [1, 2].reduce((acc, value) => [...acc, value], []);\n",
    );
    const quadratic = lint();
    assert.equal(quadratic.status, 1, quadratic.stdout + quadratic.stderr);
    assert.match(quadratic.stdout + quadratic.stderr, /no-accumulating-spread/);
  }));

test("changed runner limits working-tree files and package scope, and forwards mode", () =>
  fixture((dir) => {
    git(dir, "init", "-q", "-b", "main");
    mkdirSync(join(dir, "pkg"));
    for (const path of [
      "staged.ts",
      "unstaged.ts",
      "untouched.ts",
      "deleted.ts",
      "rename.ts",
      "pkg/inside.ts",
    ]) {
      writeFileSync(join(dir, path), "export const value = 1;\n");
    }
    writeFileSync(join(dir, ".gitignore"), "ignored.ts\n");
    git(dir, "add", ".");
    git(
      dir,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    writeFileSync(join(dir, "staged.ts"), "export const value = 2;\n");
    git(dir, "add", "staged.ts");
    git(dir, "mv", "rename.ts", "renamed file.ts");
    rmSync(join(dir, "deleted.ts"));
    for (const path of ["unstaged.ts", "untracked.ts", "ignored.ts", "notes.md", "pkg/inside.ts"]) {
      writeFileSync(join(dir, path), "export const value = 3;\n");
    }
    const capture = join(dir, "calls.json");
    const mock = join(dir, "oxlint-mock");
    writeFileSync(
      mock,
      `#!${process.execPath}\nimport("node:fs").then(fs => fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args:process.argv.slice(2), changed:process.env.JEV_CHANGED_ONLY})));\n`,
    );
    chmodSync(mock, 0o755);
    const run = (cwd, args = [], changed) => {
      const env = { ...process.env };
      delete env.JEV_CHANGED_ONLY;
      if (changed !== undefined) env.JEV_CHANGED_ONLY = changed;
      const result = spawnSync(
        process.execPath,
        [
          join(root, "tools/oxlint/anti-slop/jev/lint-changed.ts"),
          `--oxlint=${mock}`,
          "-c",
          "review.ts",
          ...args,
        ],
        { cwd, env, encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return JSON.parse(readFileSync(capture, "utf8"));
    };
    assert.deepEqual(run(dir), {
      args: [
        "-c",
        "review.ts",
        "pkg/inside.ts",
        "renamed file.ts",
        "staged.ts",
        "unstaged.ts",
        "untracked.ts",
      ],
      changed: "1",
    });
    assert.deepEqual(run(join(dir, "pkg")), {
      args: ["-c", "review.ts", "inside.ts"],
      changed: "1",
    });
    assert.deepEqual(run(dir, ["--all"]), { args: ["-c", "review.ts"], changed: "0" });
    assert.equal(run(dir, [], "0").changed, "0");
  }));

test("mock Jev payload includes untouched functions for file targets, not function targets", () =>
  fixture((dir) => {
    git(dir, "init", "-q", "-b", "main");
    const original =
      'export function changed() {\n  return "before";\n}\n\nexport function untouched() {\n  return "untouched-payload";\n}\n';
    writeFileSync(join(dir, "changed.ts"), original);
    writeFileSync(join(dir, "unchanged.ts"), 'export const secret = "unchanged-file-control";\n');
    git(dir, "add", ".");
    git(
      dir,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    writeFileSync(join(dir, "changed.ts"), original.replace('"before"', '"after"'));
    const config = join(dir, "review.json");
    writeFileSync(
      config,
      JSON.stringify({
        categories: { correctness: "off" },
        plugins: [],
        jsPlugins: [
          {
            name: "anti-slop-martinfowler-jev",
            specifier: join(root, "tools/oxlint/anti-slop/martinfowler/jev-plugin.ts"),
          },
        ],
        rules: Object.fromEntries(
          martinFowlerJevRules.map(({ id }) => [`anti-slop-martinfowler-jev/${id}`, "warn"]),
        ),
      }),
    );
    const capture = join(dir, "requests.jsonl");
    const loader = join(dir, "mock.mjs");
    writeFileSync(
      loader,
      `import { registerHooks } from "node:module";
import { Socket } from "node:net";
const denyNetwork = () => { throw new Error("Network forbidden in mock Jev test"); };
Socket.prototype.connect = denyNetwork;
globalThis.fetch = denyNetwork;
registerHooks({ load(url, context, next) {
  if (!url.endsWith("/sync-jev.mjs")) return next(url, context);
  return { format: "module", shortCircuit: true, source: ${JSON.stringify(`
    import { appendFileSync } from "node:fs";
    export function askModel(input) {
      appendFileSync(${JSON.stringify(capture)}, JSON.stringify(input.request) + "\\n");
      return { ok: true, model: "mock-no-network", answers: Object.fromEntries(Object.keys(input.request.questions).map(id => [id, { type: "boolean", probability: 0.01 }])) };
    }
  `)} };
}});
`,
    );
    const env = {
      ...process.env,
      NODE_OPTIONS: `--import=${loader}`,
      JEV_CHANGED_ONLY: "1",
      JEV_CHANGED_BASE: "HEAD",
      TYPESAFE_API_KEY: "fake-never-send",
    };
    const result = spawnSync(
      process.execPath,
      [
        join(root, "tools/oxlint/anti-slop/jev/lint-changed.ts"),
        "--ext=.ts",
        `--oxlint=${join(root, "node_modules/.bin/oxlint")}`,
        "--threads=2",
        "-c",
        config,
      ],
      { cwd: dir, env, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const requests = readFileSync(capture, "utf8").trim().split("\n").map(JSON.parse);
    assert.equal(requests.length, 1);
    const snippets = Object.values(requests[0].state.snippets);
    assert.ok(
      snippets.some((text) => text.includes('"after"') && text.includes("untouched-payload")),
      "file targets include untouched functions",
    );
    assert.ok(
      snippets.some((text) => text.includes('"after"') && !text.includes("untouched-payload")),
      "function targets send the changed function",
    );
    assert.ok(
      !snippets.some((text) => text.includes("untouched-payload") && !text.includes('"after"')),
      "untouched function has no function-target request",
    );
    assert.ok(
      !JSON.stringify(requests).includes("unchanged-file-control"),
      "unchanged files stay out of payloads",
    );
  }));
