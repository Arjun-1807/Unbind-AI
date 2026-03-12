import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { setApiUrl, clearToken } from './config.js';
import { ensureAuth, ensureProAccess } from './auth.js';
import { uploadAndAnalyze, getAnalysisHistory } from './api.js';
import { startRepl } from './repl.js';
import { printBanner, createSpinner } from './display.js';

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
      '',
      '  ' + chalk.bold('Options:'),
      '    ' +
        chalk.yellow('--server <url>') +
        '    Backend URL  (default: http://localhost:8000)',
      '    ' + chalk.yellow('--logout') + '          Clear stored credentials',
      '    ' + chalk.yellow('-h, --help') + '        Show this help message',
      '',
      '  ' + chalk.bold('Environment:'),
      '    ' +
        chalk.yellow('UNBINDAI_API_URL') +
        '  Override the backend URL without a flag',
      '',
      '  ' + chalk.bold('Example:'),
      '    ' + chalk.dim('$ unbind ~/contracts/employment.pdf'),
      '    ' + chalk.dim('$ unbind --server https://api.example.com contract.pdf'),
      '',
    ].join('\n')
  );
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

  // ── Validate file path ─────────────────────────────────────────────────────
  const filePath = path.resolve(command);

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
  await ensureProAccess();

  // Upload & analyse
  const fileName = path.basename(filePath);
  const spin = createSpinner(
    `Uploading and analysing ${chalk.bold(fileName)}…`
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
  await startRepl(analysis);
}

// ─── list command ─────────────────────────────────────────────────────────────

async function listCommand() {
  const spin = createSpinner('Fetching your analysis history…').start();

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
