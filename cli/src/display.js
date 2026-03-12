import chalk from 'chalk';
import ora from 'ora';

// ─── Theme ────────────────────────────────────────────────────────────────────
// Claude Code palette:
//   • Prompt/accent:  #da7756  warm coral-orange  (the "◆ ›" markers)
//   • Body:           chalk.white (default terminal white)
//   • Metadata/dim:   chalk.dim / chalk.gray
//   • Success:        chalk.green
//   • Warning:        chalk.yellow
//   • Error:          chalk.red

const accent = chalk.hex('#5C6BC0');

// ─── Banner ───────────────────────────────────────────────────────────────────
// Scales of Justice — balanced beam with two hanging pans, a central pillar,
// and a solid base. Coral on the beam & pans; dim on the pillar & base.
// Wordmark sits flush to the right, vertically centred on rows 1–4.
//
//   ╓───────────────╖        ← beam
//   ║               ║
// (═══)           (═══)      ← pans
//   ║               ║
//          ╷ ╷              ← pillar
//          │ │
//      ╔═╧═╧═╗             ← base cap
//      ╚═════╝

export function printBanner(version = '1.0.0') {
  const c = accent;       // coral — beam, chains, pans
  const d = chalk.dim;    // dim   — pillar, base

  //  col:  0         1         2
  //        0123456789012345678901
  //                  ╷            ← pivot pin
  //        ╔═══════╧═══════╗    ← beam  (╧ = pivot joint)
  //        ║       ╵       ║    ← chain drops from beam ends; center spine
  //       ╔╩═════╗ ╵ ╔═════╩╗  ← pan tops clipped onto chain ends
  //       ╚═══════╝ ╚═══════╝  ← pan bottoms (each 9 chars wide)
  //                  ╵            ← spine continues
  //                  │
  //              ╔══╧══╗        ← base cap
  //              ╚═════╝        ← base

  const scales = [
    `          ${c('╷')}          `,
    `  ${c('╔═══════╧═══════╗')}  `,
    `  ${c('║')}       ${d('╵')}       ${c('║')}  `,
    ` ${c('╔╩═════╗')} ${d('╵')} ${c('╔═════╩╗')} `,
    ` ${c('╚═══════╝')} ${c('╚═══════╝')} `,
    `          ${d('╵')}          `,
    `          ${d('│')}          `,
    `       ${d('╔══╧══╗')}       `,
    `       ${d('╚═════╝')}       `,
  ];

  const name    = chalk.bold.white('unbind');
  const ver     = chalk.dim(`v${version}`);
  const tagline = chalk.gray('AI-powered legal');
  const sub     = chalk.gray('contract analysis');
  const rule    = chalk.dim('─'.repeat(20));

  const right = [
    '',
    '',
    `  ${name} ${ver}`,
    `  ${tagline}`,
    `  ${sub}`,
    `  ${rule}`,
    '',
    '',
    '',
  ];

  console.log();
  scales.forEach((row, i) => {
    console.log(row + (right[i] ?? ''));
  });
  console.log();
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
// Braille dots, no colour override — matches Claude Code's subtle animation.

export function createSpinner(text) {
  return ora({
    text,
    color: 'white',
    spinner: {
      interval: 80,
      frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    },
    prefixText: '  ',
  });
}

// ─── Risk helpers ─────────────────────────────────────────────────────────────
// Text-colour only — no background badges. Risk is a coloured dot + label.

const RISK_STYLES = {
  High:       { color: chalk.red,        symbol: '●' },
  Medium:     { color: chalk.yellow,     symbol: '●' },
  Low:        { color: chalk.green,      symbol: '●' },
  Negligible: { color: chalk.gray,       symbol: '○' },
  'No Risk':  { color: chalk.blueBright, symbol: '○' },
};

function getRiskStyle(level) {
  return RISK_STYLES[level] ?? RISK_STYLES['Negligible'];
}

/** Inline  ● High  /  ○ No Risk  */
export function riskBadge(level) {
  const { color, symbol } = getRiskStyle(level);
  return color(`${symbol} ${level}`);
}

export function riskColor(level) {
  return getRiskStyle(level).color;
}

// ─── Layout primitives ────────────────────────────────────────────────────────

function truncate(text, max = 100) {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function wrap(text, width = 76, indent = '    ') {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + w).length > width) {
      if (line) lines.push(indent + line.trimEnd());
      line = w + ' ';
    } else {
      line += w + ' ';
    }
  }
  if (line.trim()) lines.push(indent + line.trimEnd());
  return lines.join('\n');
}

/** Wraps and applies a chalk colorFn to every line. */
function colorWrap(text, width, indent, colorFn) {
  return wrap(text, width, indent)
    .split('\n')
    .map((l) => colorFn(l))
    .join('\n');
}

/**
 * Claude Code section title:
 *
 *    ◆ Section Title
 *
 * Single coral diamond. No ruled underline, no box.
 */
function sectionHeader(title) {
  console.log();
  console.log(`  ${accent('◆')} ${chalk.bold.white(title)}`);
  console.log();
}

// ─── View renderers ───────────────────────────────────────────────────────────

/**
 * Summary — plain indented prose block.
 */
export function printSummary(analysisResult) {
  sectionHeader('Summary');
  const summary = analysisResult?.summary || 'No summary available.';
  console.log(colorWrap(summary, 76, '    ', chalk.white));
  console.log();
}

/**
 * Plain English
 * Risk dot + original snippet (dim), then arrow + explanation (risk colour).
 */
export function printPlainEnglish(analysisResult) {
  sectionHeader('Plain English');
  const clauses = analysisResult?.clauses || [];

  if (clauses.length === 0) {
    console.log(chalk.gray('    No clauses found.\n'));
    return;
  }

  clauses.forEach((clause, i) => {
    const idx         = chalk.dim(String(i + 1).padStart(2));
    const badge       = riskBadge(clause.riskLevel);
    const preview     = chalk.dim(truncate(clause.clauseText, 72));
    const colorFn     = riskColor(clause.riskLevel);
    const explanation = clause.simplifiedExplanation || '';

    console.log(`  ${idx}  ${badge}`);
    console.log(`      ${preview}`);
    console.log(colorWrap('→ ' + explanation, 74, '      ', colorFn));
    console.log();
  });
}

/**
 * Clauses — full detail view.
 * Compact block per clause; no box-drawing separators.
 */
export function printClauses(analysisResult) {
  sectionHeader('Clauses');
  const clauses = analysisResult?.clauses || [];

  if (clauses.length === 0) {
    console.log(chalk.gray('    No clauses found.\n'));
    return;
  }

  clauses.forEach((clause, i) => {
    const colorFn = riskColor(clause.riskLevel);
    const badge   = riskBadge(clause.riskLevel);
    const isRisky =
      clause.riskLevel !== 'No Risk' && clause.riskLevel !== 'Negligible';

    // "  Clause 01  ● High"
    console.log(
      `  ${chalk.dim('Clause ' + String(i + 1).padStart(2, '0'))}  ${badge}`
    );

    // Original clause text — dim, truncated
    if (clause.clauseText) {
      console.log(
        colorWrap(truncate(clause.clauseText, 160), 76, '    ', chalk.dim)
      );
    }

    // Plain-English explanation — risk colour
    if (clause.simplifiedExplanation) {
      console.log(colorWrap(clause.simplifiedExplanation, 76, '    ', colorFn));
    }

    // Risk reason — yellow
    if (isRisky && clause.riskReason) {
      console.log(
        colorWrap('⚠  ' + clause.riskReason, 76, '    ', chalk.yellow)
      );
    }

    // Negotiation suggestion — green
    if (
      isRisky &&
      clause.negotiationSuggestion &&
      clause.negotiationSuggestion !== 'No changes needed'
    ) {
      console.log(
        colorWrap('→  ' + clause.negotiationSuggestion, 76, '    ', chalk.green)
      );
    }

    console.log();
  });

  // ── Summary tally ──────────────────────────────────────────────────────────
  const counts = { High: 0, Medium: 0, Low: 0, Negligible: 0, 'No Risk': 0 };
  clauses.forEach((c) => {
    const k = c.riskLevel in counts ? c.riskLevel : 'Negligible';
    counts[k]++;
  });

  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([lvl, n]) => riskColor(lvl)(`${n} ${lvl}`));

  console.log(`  ${chalk.dim('─'.repeat(48))}`);
  console.log(`  ${parts.join(chalk.dim('  ·  '))}`);
  console.log();
}

/**
 * AI Q&A response
 */
export function printAIResponse(result) {
  sectionHeader('Answer');
  const text =
    typeof result === 'string'
      ? result
      : result?.result ?? result?.answer ?? JSON.stringify(result, null, 2);

  console.log(colorWrap(text, 76, '    ', chalk.white));
  console.log();
}

// ─── Status helpers ───────────────────────────────────────────────────────────
// All three mirror Claude Code's left-margin marker convention.

/** "  ✔  message" — success */
export function printSuccess(msg) {
  console.log(`  ${chalk.green('✔')}  ${chalk.white(msg)}`);
}

/** "  ✘  message" — error */
export function printError(msg) {
  console.log(`  ${chalk.red('✘')}  ${chalk.white(msg)}`);
}

/** "  ›  message" — informational / prompt */
export function printInfo(msg) {
  console.log(`  ${accent('›')}  ${chalk.white(msg)}`);
}