import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  setApiUrl,
  setApiUrlOverride,
  clearApiUrl,
  getApiUrl,
  clearToken,
} from './config.js';
import { ensureAuth, ensureProAccess } from './auth.js';
import { uploadAndAnalyze, getAnalysisHistory } from './api.js';
import { startRepl } from './repl.js';
import { printBanner, createSpinner } from './display.js';
import { exportAnalysis } from './export.js';

// ─── Version ──────────────────────────────────────────────────────────────────

// Single source of truth: package.json, so help text and banner never drift.
const VERSION = createRequire(import.meta.url)('../package.json').version;

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp() {
  printBanner(VERSION);
  console.log(
    [
      '',
      chalk.bold.cyan('  UnBindAI CLI') + chalk.dim(`  v${VERSION}`),
      '',
      '  ' + chalk.bold('Usage:'),
      '    unbind ' + chalk.cyan('<document.pdf>') + '         — analyse a contract',
      '    unbind ' + chalk.cyan('<document.txt>') + '         — analyse a text file',
      '    unbind ' + chalk.cyan('list') + '                   — browse & open a past analysis',
      '    unbind ' + chalk.cyan('export <file>') + '          — analyse & export a report (no REPL)',
      '    unbind ' + chalk.cyan('config set-server <url>') + ' — persist a custom backend URL',
      '    unbind ' + chalk.cyan('config get-server') + '      — show the backend URL in use',
      '    unbind ' + chalk.cyan('config reset-server') + '    — revert to the default backend',
      '',
      '  ' + chalk.bold('Options:'),
      '    ' +
        chalk.yellow('--server <url>') +
        '    Backend URL for THIS run only — not saved',
      '                      ' +
        chalk.dim('(default: https://unbind-backend.vercel.app; https required'),
      '                       ' + chalk.dim('except for localhost / 127.0.0.1)'),
      '    ' + chalk.yellow('--logout') + '          Clear stored credentials',
      '    ' + chalk.yellow('--format <fmt>') + '   Export format: md (default) or txt',
      '    ' + chalk.yellow('--output <path>') + '   Output file path for export',
      '    ' + chalk.yellow('-h, --help') + '        Show this help message',
      '',
      '  ' + chalk.bold('Environment:'),
      '    ' +
        chalk.yellow('UNBINDAI_API_URL') +
        '  Override the backend URL without a flag (same https rule)',
      '',
      '  ' + chalk.bold('Examples:'),
      '    ' + chalk.dim('$ unbind ~/contracts/employment.pdf'),
      '    ' + chalk.dim('$ unbind export contract.pdf --format md --output report.md'),
      '    ' + chalk.dim('$ unbind --server https://api.example.com contract.pdf'),
      '',
    ].join('\n')
  );
}

// Validate CLI path inputs to guard against injection/traversal and NUL bytes.
function safeResolveInput(p) {
  if (typeof p !== 'string' || p.includes('\0')) {
    throw new Error('Invalid path argument');
  }
  // p is the document path the local operator typed on their own command
  // line (e.g. `unbind ~/contracts/employment.pdf`) — there is no privilege
  // boundary here for a path to traverse across, unlike a server resolving a
  // path on a remote client's behalf.
  return path.resolve(p); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function main(rawArgs) {
  let args = [...rawArgs];

  // ── --server flag ──────────────────────────────────────────────────────────
  // Per-invocation only. Persisting it would let a single copy-pasted command
  // silently redirect every later run (and its credentials) at another host —
  // `unbind config set-server` is the explicit, opt-in way to make it stick.
  const serverIdx = args.indexOf('--server');
  if (serverIdx !== -1) {
    const url = args[serverIdx + 1];
    if (!url || url.startsWith('-')) {
      console.error(chalk.red('\n  ✗ --server requires a URL argument.\n'));
      process.exit(1);
    }
    try {
      setApiUrlOverride(url);
    } catch (err) {
      console.error(chalk.red(`\n  ✗ ${err.message}\n`));
      process.exit(1);
    }
    args.splice(serverIdx, 2);
  }

  const command = args[0];

  // ── config ─────────────────────────────────────────────────────────────────
  if (command === 'config') {
    configCommand(args.slice(1));
    process.exit(0);
  }

  // ── --logout ───────────────────────────────────────────────────────────────
  if (command === '--logout') {
    clearToken();
    console.log(chalk.green('\n  ✓ Logged out — credentials cleared.\n'));
    process.exit(0);
  }

  // ── --help / no args ───────────────────────────────────────────────────────
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  // ── list ───────────────────────────────────────────────────────────────────
  if (command === 'list') {
    printBanner(VERSION);
    await ensureAuth();
    await listCommand();
    process.exit(0);
  }

  // ── export ─────────────────────────────────────────────────────────────────
  if (command === 'export') {
    await exportCommand(args.slice(1));
    process.exit(0);
  }

  // ── Validate file path ─────────────────────────────────────────────────────
  const filePath = safeResolveInput(command);

  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`\n  ✗ File not found: ${command}\n`));
    process.exit(1);
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    console.error(chalk.red(`\n  ✗ Not a file: ${command}\n`));
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.pdf' && ext !== '.txt') {
    console.warn(
      chalk.yellow(`\n  ⚠  Unexpected file type "${ext}". Attempting to read as text.\n`)
    );
  }

  // ── Boot sequence ──────────────────────────────────────────────────────────
  printBanner(VERSION);

  // Authenticate
  await ensureAuth();

  // Verify Verdict Pro subscription
  const planInfo = await ensureProAccess();
  const aiModel =
    planInfo?.aiModel ||
    (planInfo?.isPro ? 'gpt-oss-120b' : 'llama-3.3-70b-versatile');

  // Upload & analyse
  const fileName = path.basename(filePath);
  const spin = createSpinner(
    `\nUploading and analysing ${chalk.bold(fileName)}…`
  ).start();

  let analysis;
  try {
    analysis = await uploadAndAnalyze(filePath);
    spin.succeed(`Analysis complete  ${chalk.dim(`(${fileName})`)}`);
  } catch (err) {
    spin.fail(chalk.red(err.message));
    process.exit(1);
  }

  // Hand off to interactive REPL
  await startRepl(analysis, { aiModel });
}

// ─── config command ───────────────────────────────────────────────────────────

/**
 * unbind config set-server <url> | get-server | reset-server
 *
 * The only way to change the backend URL permanently — deliberately separate
 * from the `--server` flag so persistence is always an explicit act.
 */
function configCommand(args) {
  const [sub, value] = args;

  if (sub === 'set-server') {
    if (!value) {
      console.error(chalk.red('\n  ✗ Usage: unbind config set-server <url>\n'));
      process.exit(1);
    }
    try {
      setApiUrl(value);
    } catch (err) {
      console.error(chalk.red(`\n  ✗ ${err.message}\n`));
      process.exit(1);
    }
    console.log(chalk.green(`\n  ✓ Backend URL saved: ${getApiUrl()}\n`));
    return;
  }

  if (sub === 'get-server') {
    try {
      console.log(chalk.cyan(`\n  ${getApiUrl()}\n`));
    } catch (err) {
      console.error(chalk.red(`\n  ✗ ${err.message}\n`));
      process.exit(1);
    }
    return;
  }

  if (sub === 'reset-server') {
    clearApiUrl();
    console.log(chalk.green('\n  ✓ Backend URL reset to the default.\n'));
    return;
  }

  console.error(
    chalk.red('\n  ✗ Usage: unbind config set-server <url> | get-server | reset-server\n')
  );
  process.exit(1);
}

// ─── list command ─────────────────────────────────────────────────────────────

async function listCommand() {
  const spin = createSpinner('\nFetching your analysis history…').start();

  let history;
  try {
    history = await getAnalysisHistory();
    spin.stop();
  } catch (err) {
    spin.fail(chalk.red(err.message));
    process.exit(1);
  }

  // The endpoint must return an array; anything else (an error object, an HTML
  // error page parsed as JSON) would otherwise blow up on the spread below with
  // a raw "history is not iterable".
  if (!Array.isArray(history)) {
    console.error(
      chalk.red('\n  ✗ Unexpected response from server while fetching history.\n')
    );
    process.exit(1);
  }

  if (history.length === 0) {
    console.log(chalk.yellow('\n  No analyses found. Run `unbind <file>` to analyse a document.\n'));
    return;
  }

  // Build choices sorted newest-first (API already sorts, but be safe)
  const sorted = [...history].sort(
    (a, b) => new Date(b.analysisDate) - new Date(a.analysisDate)
  );

  const choices = sorted.map((a, i) => {
    const date = new Date(a.analysisDate).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const highCount = a.analysisResult?.clauses?.filter((c) => c.riskLevel === 'High').length ?? 0;
    const riskLabel = highCount > 0 ? chalk.red(`  ⚠ ${highCount} high-risk`) : '';
    return {
      name: `${chalk.bold(String(i + 1).padStart(2) + '.')} ${chalk.white(a.fileName)}  ${chalk.dim(date)}${riskLabel}`,
      value: a,
      short: a.fileName,
    };
  });

  choices.push(new inquirer.Separator(chalk.dim('─────────────────────')));
  choices.push({ name: chalk.dim('Cancel'), value: null, short: 'Cancel' });

  console.log();
  const { selected } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selected',
      message: chalk.bold('Select an analysis to open:'),
      choices,
      pageSize: 12,
    },
  ]);

  if (!selected) {
    console.log(chalk.dim('\n  Cancelled.\n'));
    return;
  }

  await startRepl(selected);
}

// ─── export command ───────────────────────────────────────────────────────────

/**
 * unbind export <file> [--format md|txt] [--output path]
 *
 * Uploads and analyses the document, then immediately writes the report to
 * disk without opening the interactive REPL.
 */
async function exportCommand(args) {
  printBanner(VERSION);

  // ── Parse flags ─────────────────────────────────────────────────────────────
  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'md';

  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  // Remove parsed flags to find the file arg
  const cleanArgs = args.filter((a, i) => {
    if (a === '--format' || a === '--output') return false;
    if (i > 0 && (args[i - 1] === '--format' || args[i - 1] === '--output')) return false;
    return true;
  });

  const fileArg = cleanArgs[0];

  if (!fileArg) {
    console.error(chalk.red('\n  ✗ Usage: unbind export <file> [--format md|txt] [--output path]\n'));
    process.exit(1);
  }

  if (format !== 'md' && format !== 'txt') {
    console.error(chalk.red(`\n  ✗ Unknown format "${format}". Use md or txt.\n`));
    process.exit(1);
  }

  const filePath = safeResolveInput(fileArg);

  if (!fs.existsSync(filePath)) {
    console.error(chalk.red(`\n  ✗ File not found: ${fileArg}\n`));
    process.exit(1);
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  await ensureAuth();
  await ensureProAccess();

  // ── Upload & analyse ────────────────────────────────────────────────────────
  const fileName = path.basename(filePath);
  const spin = createSpinner(`\nUploading and analysing ${chalk.bold(fileName)}…`).start();

  let analysis;
  try {
    analysis = await uploadAndAnalyze(filePath);
    spin.succeed(`Analysis complete  ${chalk.dim(`(${fileName})`)}`);
  } catch (err) {
    spin.fail(chalk.red(err.message));
    process.exit(1);
  }

  // ── Export ──────────────────────────────────────────────────────────────────
  console.log();
  try {
    exportAnalysis(analysis, { outputPath, format });
  } catch (err) {
    console.error(chalk.red(`\n  ✗ ${err.message}\n`));
    process.exit(1);
  }
}
