import { input, password } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, DEFAULT_API_URL, getConfig } from '../config.js';

export async function loginCommand() {
  console.log(chalk.hex('#4ade80').bold('\n  ChainWard CLI\n'));

  const existing = getConfig();
  if (!existing?.apiKey) {
    console.log(`  ${chalk.bold('No API key?')} Get one in 30 seconds:\n`);
    console.log(`  1. Go to ${chalk.cyan('chainward.ai')}`);
    console.log(`  2. Connect wallet → Settings → Generate Key`);
    console.log(`  3. Paste it here\n`);
  }

  const apiKey = await password({
    message: 'API key (ag_...)',
    mask: '*',
    validate: (val) => {
      if (!val.startsWith('ag_')) return 'API key must start with "ag_"';
      if (val.length < 10) return 'API key too short';
      return true;
    },
  });

  const apiUrl = existing?.apiUrl ?? DEFAULT_API_URL;

  const spinner = ora('Validating API key...').start();

  try {
    const res = await fetch(`${apiUrl}/api/agents`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      spinner.fail('Invalid API key.');
      process.exit(1);
    }

    const body = (await res.json()) as { success: boolean; data: unknown[] };
    if (!body.success) {
      spinner.fail('Invalid API key.');
      process.exit(1);
    }

    saveConfig({ apiKey, apiUrl });
    spinner.succeed(
      `Logged in. ${body.data.length} agent${body.data.length === 1 ? '' : 's'} found.`,
    );
  } catch (err) {
    if (err instanceof Error && (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED'))) {
      spinner.fail('Could not reach ChainWard API. Check your connection.');
    } else {
      spinner.fail('Login failed.');
    }
    process.exit(1);
  }
}
