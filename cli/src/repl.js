import inquirer from 'inquirer';
import chalk from 'chalk';
import {
  printSummary,
  printPlainEnglish,
  printClauses,
  printAIResponse,
  createSpinner,
} from './display.js';
import { askQuestion } from './api.js';

// ─── Menu definition ──────────────────────────────────────────────────────────

const MENU = [
  { name: `${chalk.bold('1.')} Summarize`, value: 'summarize', short: 'Summarize' },
  { name: `${chalk.bold('2.')} Translate to plain English`, value: 'translate', short: 'Translate' },
  { name: `${chalk.bold('3.')} Ask a question`, value: 'ask', short: 'Ask a question' },
  { name: `${chalk.bold('4.')} Extract clauses`, value: 'clauses', short: 'Extract clauses' },
  new inquirer.Separator(chalk.dim('─────────────────────')),
  { name: `${chalk.bold('5.')} Exit`, value: 'exit', short: 'Exit' },
];

// ─── REPL ─────────────────────────────────────────────────────────────────────

/**
 * Starts the interactive REPL loop for a loaded analysis.
 *
 * @param {object} analysis  Full StoredAnalysis returned by the backend.
 */
export async function startRepl(analysis) {
  const { fileName, analysisResult, documentText } = analysis;

  const clauseCount = analysisResult?.clauses?.length ?? 0;
  const highCount = analysisResult?.clauses?.filter((c) => c.riskLevel === 'High').length ?? 0;

  // ── Load summary ──
  console.log(
    chalk.bold.green(`\n  ✓ Loaded: `) +
      chalk.white(fileName)
  );
  console.log(
    chalk.dim(`    ${clauseCount} clauses`) +
      (highCount > 0 ? chalk.red(`  ·  ${highCount} high-risk`) : '')
  );
  console.log(
    chalk.dim(`    AI Model: llama-3.3-70b-versatile  ·  Groq`)
  );

  // ── REPL loop ──
  while (true) {
    console.log();
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: chalk.bold('What would you like to do?'),
        choices: MENU,
        pageSize: 10,
      },
    ]);

    console.log(); // breathing room

    switch (action) {

      // ── 1. Summarize ──────────────────────────────────────────────────────
      case 'summarize':
        printSummary(analysisResult);
        break;

      // ── 2. Translate to plain English ─────────────────────────────────────
      case 'translate':
        printPlainEnglish(analysisResult);
        break;

      // ── 3. Ask a question ─────────────────────────────────────────────────
      case 'ask': {
        const { question } = await inquirer.prompt([
          {
            type: 'input',
            name: 'question',
            message: chalk.cyan('Your question:'),
            validate: (v) =>
              v.trim().length > 3 || 'Please enter a question (at least 4 characters)',
          },
        ]);

        console.log();
        const spin = createSpinner('Thinking…').start();

        try {
          const result = await askQuestion(documentText, question.trim());
          spin.stop();
          printAIResponse(result);
        } catch (err) {
          spin.fail(chalk.red(`Error: ${err.message}`));
        }
        break;
      }

      // ── 4. Extract clauses ────────────────────────────────────────────────
      case 'clauses':
        printClauses(analysisResult);
        break;

      // ── 5. Exit ───────────────────────────────────────────────────────────
      case 'exit':
        console.log(chalk.cyan('\n  Goodbye! 👋\n'));
        process.exit(0);
    }
  }
}
