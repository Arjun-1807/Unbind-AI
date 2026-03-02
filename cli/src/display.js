import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';

// ─── Banner ───────────────────────────────────────────────────────────────────

export function printBanner() {
  const title =
    chalk.bold.cyan('UnBind') + chalk.bold.white('AI') + '  ' + chalk.dim('CLI');
  const subtitle = chalk.dim('AI-powered legal contract analysis');

  console.log(
    boxen(`${title}\n${subtitle}`, {
      padding: { top: 0, bottom: 0, left: 3, right: 3 },
      margin: { top: 1, bottom: 1 },
      borderStyle: 'round',
      borderColor: 'cyan',
      textAlignment: 'center',
    })
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function createSpinner(text) {
  return ora({ text, color: 'cyan', spinner: 'dots2' });
}

// ─── Risk helpers ─────────────────────────────────────────────────────────────

const RISK_STYLES = {
  High: { badge: chalk.bgRed.white.bold, text: chalk.red },
  Medium: { badge: chalk.bgYellow.black.bold, text: chalk.yellow },
  Low: { badge: chalk.bgGreen.black.bold, text: chalk.green },
  Negligible: { badge: chalk.bgGray.white, text: chalk.gray },
  'No Risk': { badge: chalk.bgBlue.white, text: chalk.blue },
};

function getRiskStyle(level) {
  return RISK_STYLES[level] || RISK_STYLES['Negligible'];
}

export function riskBadge(level) {
  return getRiskStyle(level).badge(` ${level} `);
}

export function riskColor(level) {
  return getRiskStyle(level).text;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

/** Truncates and normalises whitespace in a string. */
function truncate(text, max = 100) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/** Wraps long text at `width` characters (simple word-wrap). */
function wordWrap(text, width = 80, indent = '  ') {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + word).length > width) {
      if (line) lines.push(indent + line.trimEnd());
      line = word + ' ';
    } else {
      line += word + ' ';
    }
  }
  if (line.trim()) lines.push(indent + line.trimEnd());
  return lines.join('\n');
}

function sectionHeader(icon, title) {
  const line = '─'.repeat(Math.min(title.length + 4, 58));
  console.log('\n' + chalk.bold.cyan(`  ${icon}  ${title}`));
  console.log(chalk.dim(`  ${line}`));
}

// ─── View renderers ───────────────────────────────────────────────────────────

/**
 * 1. Summarize
 */
export function printSummary(analysisResult) {
  sectionHeader('📄', 'Summary');
  const summary = analysisResult?.summary || 'No summary available.';
  console.log('\n' + wordWrap(summary, 80, '  ') + '\n');
}

/**
 * 2. Translate to plain English
 *    Shows every clause's simplified explanation, colour-coded by risk.
 */
export function printPlainEnglish(analysisResult) {
  sectionHeader('📖', 'Plain English Translation');
  const clauses = analysisResult?.clauses || [];

  if (clauses.length === 0) {
    console.log(chalk.gray('\n  No clauses found.\n'));
    return;
  }

  clauses.forEach((clause, i) => {
    const num = chalk.dim(`  ${String(i + 1).padStart(2)}.`);
    const badge = riskBadge(clause.riskLevel);
    const preview = chalk.dim(truncate(clause.clauseText, 70));
    const explanation = riskColor(clause.riskLevel)(clause.simplifiedExplanation || '');

    console.log(`\n${num} ${badge}  ${preview}`);
    console.log(wordWrap('→ ' + explanation, 80, '       '));
  });
  console.log();
}

/**
 * 4. Extract clauses
 *    Full clause detail with risk reasoning and negotiation tip.
 */
export function printClauses(analysisResult) {
  sectionHeader('📋', 'Contract Clauses');
  const clauses = analysisResult?.clauses || [];

  if (clauses.length === 0) {
    console.log(chalk.gray('\n  No clauses found.\n'));
    return;
  }

  clauses.forEach((clause, i) => {
    const badge = riskBadge(clause.riskLevel);
    const colorFn = riskColor(clause.riskLevel);

    console.log(`\n  ${chalk.bold(`Clause ${i + 1}`)}  ${badge}`);

    // Original clause text (truncated)
    if (clause.clauseText) {
      console.log(chalk.dim(wordWrap(truncate(clause.clauseText, 160), 80, '  │  ')));
    }

    // Plain-English explanation
    if (clause.simplifiedExplanation) {
      console.log(colorFn(wordWrap(clause.simplifiedExplanation, 80, '  ✦  ')));
    }

    // Risk / negotiation — skip for no-risk clauses
    if (clause.riskLevel !== 'No Risk' && clause.riskLevel !== 'Negligible') {
      if (clause.riskReason) {
        console.log(chalk.yellow(wordWrap('⚠  ' + clause.riskReason, 80, '     ')));
      }
      if (
        clause.negotiationSuggestion &&
        clause.negotiationSuggestion !== 'No changes needed'
      ) {
        console.log(chalk.green(wordWrap('💡 ' + clause.negotiationSuggestion, 80, '     ')));
      }
    }
  });

  // Summary bar
  const counts = { High: 0, Medium: 0, Low: 0, Negligible: 0, 'No Risk': 0 };
  clauses.forEach((c) => {
    const k = c.riskLevel in counts ? c.riskLevel : 'Negligible';
    counts[k]++;
  });

  const bar = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([level, n]) => riskColor(level)(`${n} ${level}`))
    .join(chalk.dim('  ·  '));

  console.log('\n' + chalk.dim('  ─────────────────'));
  console.log(`  ${bar}\n`);
}

/**
 * AI Q&A response (used by "Ask a question").
 */
export function printAIResponse(result) {
  sectionHeader('🤖', 'AI Answer');
  const text =
    typeof result === 'string'
      ? result
      : result?.result || result?.answer || JSON.stringify(result, null, 2);

  console.log('\n' + wordWrap(text, 80, '  ') + '\n');
}
