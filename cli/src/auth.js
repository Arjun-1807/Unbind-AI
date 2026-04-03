import inquirer from 'inquirer';
import chalk from 'chalk';
import { getToken, clearToken } from './config.js';
import { getMe, getUserPlan, login, signup } from './api.js';

const PRO_PLAN = 'Verdict';

/**
 * Checks that the authenticated user is subscribed to the Verdict Pro plan.
 * Exits the process with a friendly message if they are not.
 */
export async function ensureProAccess() {
  let planInfo;
  try {
    planInfo = await getUserPlan();
  } catch {
    console.error(chalk.red('\n  ✗ Could not verify your subscription. Please try again.\n'));
    process.exit(1);
  }

  if (planInfo.plan !== PRO_PLAN) {
    console.log(
      '\n' +
      chalk.bgRed.white.bold('  ✗ CLI Access Restricted  ') +
      '\n\n' +
      chalk.white('  The UnBindAI CLI is exclusively available to ') +
      chalk.cyan.bold('Verdict') +
      chalk.white(' subscribers.') +
      '\n\n' +
      (planInfo.plan
        ? chalk.dim(`  Your current plan: ${chalk.yellow(planInfo.plan)}`) + '\n'
        : chalk.dim('  Your current plan: ') + chalk.yellow('Free') + '\n') +
      '\n' +
      chalk.white('  Upgrade at: ') +
      chalk.underline.cyan('https://unbind-eight.vercel.app/pricing') +
      '\n'
    );
    process.exit(1);
  }

  return planInfo;
}

/**
 * Ensures the user is authenticated before any API call.
 *
 * Strategy:
 *  1. If a token is stored, validate it with GET /api/auth/me.
 *  2. If valid → continue silently.
 *  3. If invalid / missing → interactive login or signup prompt.
 */
export async function ensureAuth() {
  const token = getToken();

  if (token) {
    try {
      await getMe();
      return; // already authenticated ✓
    } catch {
      // Token is expired or invalid – fall through to prompt
      clearToken();
    }
  }

  console.log(
    chalk.yellow('\n  🔐 Authentication required') +
      chalk.dim(' — your credentials are stored locally for future sessions.\n')
  );

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Do you have an UnBindAI account?',
      choices: [
        { name: 'Yes — log in', value: 'login' },
        { name: 'No  — create a new account', value: 'signup' },
      ],
    },
  ]);

  if (action === 'login') {
    await promptLogin();
  } else {
    await promptSignup();
  }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function promptLogin() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      validate: (v) => v.includes('@') || 'Please enter a valid email address',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '●',
      validate: (v) => v.length >= 1 || 'Password is required',
    },
  ]);

  try {
    await login(answers.email, answers.password);
    console.log(chalk.green('\n  ✓ Logged in successfully\n'));
  } catch (err) {
    console.error(chalk.red(`\n  ✗ Login failed: ${err.message}\n`));
    process.exit(1);
  }
}

async function promptSignup() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: 'Username:',
      validate: (v) => v.trim().length >= 2 || 'Username must be at least 2 characters',
    },
    {
      type: 'input',
      name: 'email',
      message: 'Email:',
      validate: (v) => v.includes('@') || 'Please enter a valid email address',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '●',
      validate: (v) => v.length >= 6 || 'Password must be at least 6 characters',
    },
  ]);

  try {
    await signup(answers.username, answers.email, answers.password);
    console.log(chalk.green('\n  ✓ Account created — welcome to UnBindAI!\n'));
  } catch (err) {
    console.error(chalk.red(`\n  ✗ Sign-up failed: ${err.message}\n`));
    process.exit(1);
  }
}
