import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/opsx-cost.mjs");
const tempRoots: string[] = [];

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "opsx-cost-"));
  tempRoots.push(root);
  return root;
}

function run(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? process.cwd(),
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
}

function writeTicket(root: string) {
  const ticket = join(root, "ticket.md");
  writeFileSync(ticket, "# Ticket\n\n- Status: proposed\n\n## Request\n\nfixture\n");
  return ticket;
}

function writeTasks(changeDir: string, count: number) {
  mkdirSync(changeDir, { recursive: true });
  const lines = Array.from({ length: count }, (_, index) => `- [ ] ${index + 1}.1 Task ${index + 1}`);
  writeFileSync(join(changeDir, "tasks.md"), `# Tasks\n\n${lines.join("\n")}\n`);
}

function sampleTicket(cost: number) {
  const ledger = {
    version: 1,
    stages: [
      {
        stage: "apply",
        session: "ses_sample",
        sessionCost: cost,
        input: 1000,
        output: 500,
        reasoning: 0,
        at: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  return [
    "# Sample ticket",
    "",
    "- Status: implemented",
    "",
    "## Request",
    "",
    "fixture",
    "",
    "## Implementation",
    "",
    "- Completed: 2026-01-01",
    "- Tasks: 2/2",
    "",
    "## Cost",
    "",
    `<!-- opsx-cost:${JSON.stringify(ledger)} -->`,
    "",
  ].join("\n");
}

function ledgerFrom(ticket: string) {
  const markdown = readFileSync(ticket, "utf8");
  const match = /<!--\s*opsx-cost:([\s\S]*?)-->/.exec(markdown);
  expect(match).not.toBeNull();
  return JSON.parse(match![1].trim()) as {
    stages: Array<{ stage: string }>;
    estimate?: { amount: number; tasks: number };
  };
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("opsx-cost estimate", () => {
  it("falls back to the documented baseline when history is sparse", () => {
    const root = tempRoot();
    const ticket = writeTicket(root);
    const change = join(root, "change");
    writeTasks(change, 7);

    const output = run(["estimate", ticket, "--change", change]);

    expect(output).toContain("estimate $0.35");
    expect(output).toContain("default baseline ($0.05/task); 0 historical apply samples");
    const markdown = readFileSync(ticket, "utf8");
    expect(markdown).toContain("Estimate: **$0.35** (range $0.17–$0.53) for 7 tasks.");
    expect(ledgerFrom(ticket).estimate).toMatchObject({ amount: 0.35, tasks: 7 });
  });

  it("uses the median apply cost per task once three samples exist", () => {
    const root = tempRoot();
    const tickets = join(root, "tickets");
    mkdirSync(tickets);

    for (const [name, cost] of [
      ["ticket-a", 0.2],
      ["ticket-b", 0.1],
      ["ticket-c", 0.3],
    ] as const) {
      const dir = join(tickets, name);
      mkdirSync(dir);
      writeFileSync(join(dir, "ticket.md"), sampleTicket(cost));
    }

    const ticket = writeTicket(root);
    const change = join(root, "change");
    writeTasks(change, 4);

    const output = run(["estimate", ticket, "--change", change], { cwd: root });

    expect(output).toContain("estimate $0.40");
    expect(output).toContain(
      "median historical apply cost per task; 3 historical apply samples",
    );
    expect(ledgerFrom(ticket).estimate).toMatchObject({ amount: 0.4, tasks: 4 });
  });

  it("accepts an explicit task count override", () => {
    const root = tempRoot();
    const ticket = writeTicket(root);

    const output = run(["estimate", ticket, "--tasks", "3"]);

    expect(output).toContain("estimate $0.15");
    expect(output).toContain("for 3 tasks");
    expect(ledgerFrom(ticket).estimate).toMatchObject({ amount: 0.15, tasks: 3 });
  });

  it("keeps the estimate when a later record adds an apply stage", () => {
    const root = tempRoot();
    const ticket = writeTicket(root);
    const change = join(root, "change");
    writeTasks(change, 2);
    run(["estimate", ticket, "--change", change]);

    const dbPath = join(root, "opencode.db");
    const db = new DatabaseSync(dbPath);
    db.exec(
      "create table session_v2 (id text primary key, parent_id text, cost real, tokens_input integer, tokens_output integer, tokens_reasoning integer)",
    );
    db.prepare(
      "insert into session_v2 (id, parent_id, cost, tokens_input, tokens_output, tokens_reasoning) values (?, null, ?, ?, ?, ?)",
    ).run("ses_test", 0.42, 5000, 2500, 1000);
    db.close();

    run(["record", "apply", ticket], {
      env: { OPENCODE_DB: dbPath, OPENCODE_SESSION_ID: "ses_test" },
    });

    const ledger = ledgerFrom(ticket);
    expect(ledger.stages.map((stage) => stage.stage)).toEqual(["apply"]);
    expect(ledger.estimate).toMatchObject({ amount: 0.1, tasks: 2 });
  });
});
