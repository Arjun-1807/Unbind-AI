import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { setApiUrl, clearToken } from './config.js';
import { ensureAuth } from './auth.js';
import { uploadAndAnalyze } from './api.js';
import { startRepl } from './repl.js';
import { printBanner, createSpinner } from './display.js';

// ─── Help text ────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(
    [
      '',
      chalk.bold.cyan('  UnBindAI CLI') + chalk.dim('  v1.0.0'),
      '',
      '  ' + chalk.bold('Usage:'),
      '    unbind ' + chalk.cyan('<document.pdf>') + '         — analyse a contract',
      '    unbind ' + chalk.cyan('<document.txt>') + '         — analyse a text file',
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
