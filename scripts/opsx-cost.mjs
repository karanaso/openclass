#!/usr/bin/env node
/**
 * Track the OpenCode cost of an OpenSpec change across propose -> apply -> archive.
 *
 * Usage:
 *   node scripts/opsx-cost.mjs record <stage> <ticket.md>
 *   node scripts/opsx-cost.mjs show <ticket.md>
 *   node scripts/opsx-cost.mjs estimate <ticket.md> --change <change-dir> [--tasks <n>]
 *
 * Cost comes from the local OpenCode database (session + descendant subagent
 * sessions). The ledger is stored as a machine-readable HTML comment inside the
 * ticket's `## Cost` section, next to a human-readable table. The `estimate`
 * command predicts the implementation (apply) cost from the change's task count
 * and stores it in the same ledger, separate from recorded actual stages.
 *
 * Cost tracking is best-effort: it must never block apply/archive. When the
 * database or session cannot be read, the command prints an `opsx-cost: skipped`
 * line and exits 0.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

let DatabaseSync = null
try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  // node:sqlite is unavailable on this Node version; fall back to `opencode session export`.
}

const STAGES = new Set(['propose', 'apply', 'archive', 'update'])

const ESTIMATE = {
  perTaskCost: 0.05,
  floor: 0.1,
  lowFactor: 0.5,
  highFactor: 1.5,
  minSamples: 3,
}

function usage() {
  console.error('Usage: node scripts/opsx-cost.mjs record <stage> <ticket.md>')
  console.error('       node scripts/opsx-cost.mjs show <ticket.md>')
  console.error(
    '       node scripts/opsx-cost.mjs estimate <ticket.md> --change <change-dir> [--tasks <n>]',
  )
}

function round(value, digits = 8) {
  const factor = 10 ** digits
  return Math.round((Number(value) || 0) * factor) / factor
}

function money(value) {
  const n = Number(value) || 0
  if (n > 0 && n < 0.0001) return '<$0.0001'
  return `$${n.toFixed(4)}`
}

function moneyShort(value) {
  const n = Number(value) || 0
  if (n > 0 && n < 0.01) return '<$0.01'
  return `$${n.toFixed(2)}`
}

function tokens(value) {
  return new Intl.NumberFormat('en-US').format(Math.round(Number(value) || 0))
}

function parseArgs(args) {
  const positional = []
  const flags = {}

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }

    const key = arg.slice(2)
    const next = args[i + 1]
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true
    } else {
      flags[key] = next
      i += 1
    }
  }

  return { positional, flags }
}

function countTrackedTasks(tasksFile) {
  const markdown = readFileSync(tasksFile, 'utf8')
  const matches = markdown.match(/^\s*-\s*\[[ xX]\]/gm)
  return matches ? matches.length : 0
}

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function normalizeEstimate(estimate) {
  if (!estimate || typeof estimate !== 'object') return null

  const amount = Number(estimate.amount)
  const low = Number(estimate.low)
  const high = Number(estimate.high)
  const tasks = Number(estimate.tasks)
  const perTaskCost = Number(estimate.perTaskCost)
  const samples = Number(estimate.samples)

  if (![amount, low, high, tasks, perTaskCost, samples].every(Number.isFinite)) return null

  return {
    amount: round(amount),
    low: round(low),
    high: round(high),
    tasks: Math.max(0, Math.round(tasks)),
    perTaskCost: round(perTaskCost),
    basis: typeof estimate.basis === 'string' ? estimate.basis : 'unknown basis',
    samples: Math.max(0, Math.round(samples)),
    at: typeof estimate.at === 'string' ? estimate.at : null,
  }
}

function sessionLabel(id) {
  return `\`${id}\``
}

function stageLabel(stage) {
  return stage.charAt(0).toUpperCase() + stage.slice(1)
}

function resolveOpenCodeDb() {
  if (process.env.OPENCODE_DB) return process.env.OPENCODE_DB

  try {
    const output = execFileSync('opencode', ['debug', 'paths'], {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    for (const line of output.split(/\r?\n/)) {
      const match = /^\s*db\s+(.+?)\s*$/.exec(line)
      if (match) return match[1]
    }
  } catch {
    // Fall through to the default location.
  }

  const home = process.env.HOME || process.env.USERPROFILE
  if (home) return `${home}/.local/share/opencode/opencode.db`
  return null
}

function readSessionTotals(sessionId) {
  if (!DatabaseSync) return null

  const dbPath = resolveOpenCodeDb()
  if (!dbPath) return null

  let db
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    return null
  }

  try {
    const tables = db
      .prepare("select name from sqlite_master where type = 'table'")
      .all()
      .map((row) => row.name)

    const candidates = ['session_v2', 'session'].filter((table) => tables.includes(table))
    for (const table of candidates) {
      const exists = db
        .prepare(`select id from ${table} where id = ?`)
        .get(sessionId)
      if (!exists) continue

      const row = db
        .prepare(
          `with recursive tree(id) as (
             select id from ${table} where id = ?
             union all
             select child.id from ${table} child join tree on child.parent_id = tree.id
           )
           select count(*) as sessions,
                  coalesce(sum(cost), 0) as cost,
                  coalesce(sum(tokens_input), 0) as input,
                  coalesce(sum(tokens_output), 0) as output,
                  coalesce(sum(tokens_reasoning), 0) as reasoning
           from ${table}
           where id in (select id from tree)`,
        )
        .get(sessionId)

      return {
        source: table,
        sessions: Number(row.sessions) || 1,
        cost: round(row.cost),
        input: Number(row.input) || 0,
        output: Number(row.output) || 0,
        reasoning: Number(row.reasoning) || 0,
      }
    }

    return null
  } catch {
    return null
  } finally {
    try {
      db.close()
    } catch {
      // Ignore close errors.
    }
  }
}

function readSessionTotalsFromExport(sessionId) {
  try {
    const output = execFileSync('opencode', ['session', 'export', sessionId], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const data = JSON.parse(output)
    const info = data?.info ?? {}
    return {
      source: 'session export',
      sessions: 1,
      cost: round(info.cost),
      input: Number(info.tokens?.input) || 0,
      output: Number(info.tokens?.output) || 0,
      reasoning: Number(info.tokens?.reasoning) || 0,
    }
  } catch {
    return null
  }
}

function loadLedger(markdown) {
  const match = /<!--\s*opsx-cost:([\s\S]*?)-->/.exec(markdown)
  if (!match) return { version: 1, stages: [] }

  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed || !Array.isArray(parsed.stages)) return { version: 1, stages: [] }
    parsed.version = 1
    return parsed
  } catch {
    return { version: 1, stages: [] }
  }
}

function renderSection(ledger) {
  const lastBySession = new Map()
  const rows = ledger.stages.map((entry) => {
    const previous = lastBySession.get(entry.session)
    const cost = previous
      ? Math.max(0, entry.sessionCost - previous.sessionCost)
      : entry.sessionCost
    const input = previous ? Math.max(0, entry.input - previous.input) : entry.input
    const output = previous ? Math.max(0, entry.output - previous.output) : entry.output
    const reasoning = previous
      ? Math.max(0, entry.reasoning - previous.reasoning)
      : entry.reasoning

    lastBySession.set(entry.session, entry)
    return {
      ...entry,
      cost: round(cost),
      input,
      output,
      reasoning,
    }
  })

  const total = round(rows.reduce((sum, row) => sum + row.cost, 0))
  const totalInput = rows.reduce((sum, row) => sum + row.input, 0)
  const totalOutput = rows.reduce((sum, row) => sum + row.output, 0)
  const totalReasoning = rows.reduce((sum, row) => sum + row.reasoning, 0)
  const updated = new Date().toISOString()

  const estimate = normalizeEstimate(ledger.estimate)
  const ledgerJson = JSON.stringify({
    version: 1,
    stages: ledger.stages,
    ...(estimate ? { estimate } : {}),
  })
  const table = [
    '| Stage | Cost | Tokens (in / out / reasoning) | Session |',
    '| --- | ---: | ---: | --- |',
    ...rows.map(
      (row) =>
        `| ${stageLabel(row.stage)} | ${money(row.cost)} | ${tokens(row.input)} / ${tokens(row.output)} / ${tokens(row.reasoning)} | ${sessionLabel(row.session)} |`,
    ),
    `| **Total** | **${money(total)}** | ${tokens(totalInput)} / ${tokens(totalOutput)} / ${tokens(totalReasoning)} | |`,
  ].join('\n')

  const estimateLines = estimate
    ? [
        '',
        `Estimate: **${moneyShort(estimate.amount)}** (range ${moneyShort(estimate.low)}–${moneyShort(estimate.high)}) for ${estimate.tasks} task${estimate.tasks === 1 ? '' : 's'}.`,
        `Basis: ${estimate.basis}; ${estimate.samples} historical apply sample${estimate.samples === 1 ? '' : 's'}.`,
      ]
    : []

  const section = [
    '## Cost',
    '',
    `<!-- opsx-cost:${ledgerJson} -->`,
    '',
    `Total (propose → apply → archive): **${money(total)}**. Updated ${updated}.`,
    ...estimateLines,
    '',
    'Estimated from OpenCode session cost, including subagent sessions. A session shared with unrelated work is counted in full, so treat this as an upper-bound estimate.',
    ...(ledger.stages.length > 0 && !ledger.stages.some((entry) => entry.stage === 'propose')
      ? [
          '',
          'Propose cost was not recorded for this change; this total covers the recorded stages only.',
        ]
      : []),
    '',
    table,
  ].join('\n')

  return { section, total, totalInput, totalOutput, totalReasoning, rows, estimate }
}

function upsertCostSection(markdown, section) {
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
  const lines = markdown.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => /^## Cost\s*$/.test(line))
  const sectionLines = section.split('\n')

  let baseLines = lines
  if (startIndex !== -1) {
    let endIndex = lines.length
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      if (/^##\s+/.test(lines[i])) {
        endIndex = i
        break
      }
    }
    baseLines = [...lines.slice(0, startIndex), ...lines.slice(endIndex)]
  }

  while (baseLines.length > 0 && baseLines[baseLines.length - 1] === '') baseLines.pop()
  const base = baseLines.join(eol).replace(/\s*$/, '')
  return `${base}${eol}${eol}${sectionLines.join(eol)}${eol}`
}

function readTicket(ticketArg) {
  const ticketPath = isAbsolute(ticketArg) ? ticketArg : resolve(process.cwd(), ticketArg)
  let markdown
  try {
    markdown = readFileSync(ticketPath, 'utf8')
  } catch {
    console.error(`opsx-cost: skipped (ticket not found: ${ticketPath})`)
    process.exit(0)
  }
  return { ticketPath, markdown }
}

function historicalApplySamples(ticketsDir, excludePath) {
  const samples = []
  let entries
  try {
    entries = readdirSync(ticketsDir, { withFileTypes: true })
  } catch {
    return samples
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const ticketPath = resolve(ticketsDir, entry.name, 'ticket.md')
    if (ticketPath === excludePath) continue

    let markdown
    try {
      markdown = readFileSync(ticketPath, 'utf8')
    } catch {
      continue
    }

    const ledger = loadLedger(markdown)
    if (!ledger.stages.some((stage) => stage.stage === 'apply')) continue

    const tasks = /^-\s*Tasks:\s*(\d+)\s*\/\s*(\d+)\s*$/m.exec(markdown)
    if (!tasks) continue
    const completed = Number(tasks[1])
    if (!(completed > 0)) continue

    const applyCost = renderSection(ledger)
      .rows.filter((row) => row.stage === 'apply')
      .reduce((sum, row) => sum + row.cost, 0)
    if (applyCost > 0) samples.push(applyCost / completed)
  }

  return samples
}

function createEstimate(tasks, samples) {
  const calibrated = samples.length >= ESTIMATE.minSamples
  const perTaskCost = calibrated ? median(samples) : ESTIMATE.perTaskCost
  const amount = round(Math.max(ESTIMATE.floor, tasks * perTaskCost))

  return {
    amount,
    low: round(amount * ESTIMATE.lowFactor),
    high: round(amount * ESTIMATE.highFactor),
    tasks,
    perTaskCost: round(perTaskCost),
    basis: calibrated
      ? 'median historical apply cost per task'
      : `default baseline ($${ESTIMATE.perTaskCost.toFixed(2)}/task)`,
    samples: samples.length,
    at: new Date().toISOString(),
  }
}

function runEstimate(args) {
  const { positional, flags } = parseArgs(args)
  const ticketArg = positional[0]
  if (!ticketArg) {
    usage()
    process.exit(2)
  }

  let tasks
  if (flags.tasks !== undefined) {
    const parsed = Number(flags.tasks)
    if (!Number.isInteger(parsed) || parsed < 0) {
      console.error(`opsx-cost: skipped (invalid --tasks value: ${flags.tasks})`)
      return
    }
    tasks = parsed
  } else if (typeof flags.change === 'string') {
    const tasksFile = resolve(process.cwd(), flags.change, 'tasks.md')
    try {
      tasks = countTrackedTasks(tasksFile)
    } catch {
      console.error(`opsx-cost: skipped (tasks.md not found: ${tasksFile})`)
      return
    }
  } else {
    console.error('opsx-cost: skipped (provide --change <change-dir> or --tasks <n>)')
    return
  }

  const { ticketPath, markdown } = readTicket(ticketArg)
  const samples = historicalApplySamples(resolve(process.cwd(), 'tickets'), ticketPath)
  const estimate = createEstimate(tasks, samples)
  const ledger = loadLedger(markdown)
  ledger.estimate = estimate

  const result = renderSection(ledger)
  writeFileSync(ticketPath, upsertCostSection(markdown, result.section), 'utf8')
  printSummary(result, ticketPath)
}

function printSummary(result, ticketPath) {
  console.log(`opsx-cost: ledger has ${result.rows.length} stage snapshot(s) in ${ticketPath}`)
  console.log(`opsx-cost: total ${money(result.total)}`)
  console.log(
    `opsx-cost: tokens ${tokens(result.totalInput)} in / ${tokens(result.totalOutput)} out / ${tokens(result.totalReasoning)} reasoning`,
  )
  for (const row of result.rows) {
    console.log(
      `opsx-cost: ${stageLabel(row.stage)} ${money(row.cost)} (${sessionLabel(row.session)})`,
    )
  }
  if (result.estimate) {
    const estimate = result.estimate
    console.log(
      `opsx-cost: estimate ${moneyShort(estimate.amount)} (range ${moneyShort(estimate.low)}–${moneyShort(estimate.high)}) for ${estimate.tasks} task${estimate.tasks === 1 ? '' : 's'}`,
    )
    console.log(
      `opsx-cost: basis ${estimate.basis}; ${estimate.samples} historical apply sample${estimate.samples === 1 ? '' : 's'}`,
    )
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2)

  if (command === 'show') {
    const ticketArg = args[0]
    if (!ticketArg) {
      usage()
      process.exit(2)
    }
    const { ticketPath, markdown } = readTicket(ticketArg)
    const ledger = loadLedger(markdown)
    if (ledger.stages.length === 0 && !ledger.estimate) {
      console.log(`opsx-cost: no cost recorded in ${ticketPath}`)
      return
    }
    const result = renderSection(ledger)
    printSummary(result, ticketPath)
    return
  }

  if (command === 'estimate') {
    runEstimate(args)
    return
  }

  if (command !== 'record' || args.length < 2) {
    usage()
    process.exit(2)
  }

  const [stageOrTicket, ticketArg] = args

  if (!STAGES.has(stageOrTicket)) {
    console.error(`opsx-cost: skipped (unknown stage: ${stageOrTicket})`)
    process.exit(0)
  }

  const sessionId = process.env.OPENCODE_SESSION_ID
  if (!sessionId) {
    console.error('opsx-cost: skipped (OPENCODE_SESSION_ID is not set)')
    process.exit(0)
  }

  const totals = readSessionTotals(sessionId) ?? readSessionTotalsFromExport(sessionId)
  if (!totals) {
    console.error(`opsx-cost: skipped (could not read cost for session ${sessionId})`)
    process.exit(0)
  }

  const { ticketPath, markdown } = readTicket(ticketArg)
  const ledger = loadLedger(markdown)

  const entry = {
    stage: stageOrTicket,
    session: sessionId,
    sessionCost: round(totals.cost),
    input: Math.round(totals.input),
    output: Math.round(totals.output),
    reasoning: Math.round(totals.reasoning),
    at: new Date().toISOString(),
  }

  const last = ledger.stages[ledger.stages.length - 1]
  if (last && last.stage === entry.stage && last.session === entry.session) {
    ledger.stages[ledger.stages.length - 1] = entry
  } else {
    ledger.stages.push(entry)
  }

  const result = renderSection(ledger)
  const updated = upsertCostSection(markdown, result.section)
  writeFileSync(ticketPath, updated, 'utf8')
  printSummary(result, ticketPath)
}

main()
