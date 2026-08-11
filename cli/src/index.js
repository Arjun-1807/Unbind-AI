import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { setApiUrl, clearToken } from './config.js';
import { ensureAuth, ensureProAccess } from './auth.js';
import { uploadAndAnalyze, getAnalysisHistory } from './api.js';
import { startRepl } from './repl.js';
import { printBanner, createSpinner } from './display.js';
import { exportAnalysis } from './export.js';

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp() {
  printBanner();
  console.log(
    [
      '',
      chalk.bold.cyan('  UnBindAI CLI') + chalk.dim('  v1.0.0'),
      '',
      '  ' + chalk.bold('Usage:'),
      '    unbind ' + chalk.cyan('<document.pdf>') + '         — analyse a contract',
      '    unbind ' + chalk.cyan('<document.txt>') + '         — analyse a text file',
      '    unbind ' + chalk.cyan('list') + '                   — browse & open a past analysis',
      '    unbind ' + chalk.cyan('export <file>') + '          — analyse & export a report (no REPL)',
      '',
      '  ' + chalk.bold('Options:'),
      '    ' +
        chalk.yellow('--server <url>') +
        '    Backend URL  (default: https://unbind-backend.vercel.app)',
      '    ' + chalk.yellow('--logout') + '          Clear stored credentials',
      '    ' + chalk.yellow('--format <fmt>') + '   Export format: md (default) or txt',
      '    ' + chalk.yellow('--output <path>') + '   Output file path for export',
      '    ' + chalk.yellow('-h, --help') + '        Show this help message',
      '',
      '  ' + chalk.bold('Environment:'),
      '    ' +
        chalk.yellow('UNBINDAI_API_URL') +
        '  Override the backend URL without a flag',
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
  const serverIdx = args.indexOf('--server');
  if (serverIdx !== -1) {
    const url = args[serverIdx + 1];
    if (!url || url.startsWith('-')) {
      console.error(chalk.red('\n  ✗ --server requires a URL argument.\n'));
      process.exit(1);
    }
    setApiUrl(url);
    args.splice(serverIdx, 2);
  }

  const command = args[0];

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
    printBanner();
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
  printBanner();

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

  if (!history || history.length === 0) {
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
  printBanner();

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
