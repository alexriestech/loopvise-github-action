import * as core from '@actions/core';
import * as fs from 'fs';

type CheckResult = {
  checkName: string;
  explanation: string;
  succeeded: boolean;
};

type RunRow = {
  id: string;
  status: string;
  test_task: string;
  runs_page_url: string;
  check_results?: CheckResult[];
  fail_action_explanation?: string | null;
};

type StatusResponse = {
  suite_run_id: string;
  runs: RunRow[] | null;
};

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function runsTable(runs: RunRow[]): string {
  if (runs.length === 0) {
    return '_Waiting for runs…_\n';
  }
  const lines = [
    '| Test | Status | Link |',
    '| --- | --- | --- |',
    ...runs.map((run) => {
      const task = run.test_task ? run.test_task : run.id;
      const link = run.runs_page_url ? `[Open](${run.runs_page_url})` : '—';
      return `| ${escapeCell(task)} | ${escapeCell(run.status)} | ${link} |`;
    }),
  ];
  return `${lines.join('\n')}\n`;
}

function failureBlocks(runs: RunRow[]): string {
  const blocks: string[] = [];
  for (const run of runs) {
    const checks = run.check_results ?? [];
    const failedChecks = checks.filter((check) => check.succeeded === false);
    const badStatus =
      run.status === 'failed' || run.status === 'error' || run.status === 'cancelled';
    if (!badStatus && failedChecks.length === 0) {
      continue;
    }
    const summaryLabel = escapeCell(run.test_task ? run.test_task : run.id);
    const bodyLines: string[] = [];
    if (badStatus) {
      bodyLines.push(`**Status:** ${escapeCell(run.status)}`);
    }
    if (run.fail_action_explanation) {
      bodyLines.push(`**Fail action:** ${escapeCell(run.fail_action_explanation)}`);
    }
    for (const check of failedChecks) {
      bodyLines.push(
        `- **${escapeCell(check.checkName)}:** ${escapeCell(check.explanation)}`,
      );
    }
    blocks.push(
      `<details><summary><strong>${summaryLabel}</strong></summary>\n\n${bodyLines.join('\n')}\n\n</details>`,
    );
  }
  if (blocks.length === 0) {
    return '';
  }
  return `\n### Details\n\n${blocks.join('\n\n')}\n`;
}

function writeSummary(summaryPath: string, markdown: string): void {
  fs.writeFileSync(summaryPath, markdown, { encoding: 'utf8' });
}

async function run(): Promise<void> {
  const suiteId = core.getInput('suite_id', { required: true });
  const spaceId = core.getInput('space_id', { required: true });
  const environmentId = core.getInput('environment_id');
  const browser = core.getInput('browser');
  const triggeredByUserId = core.getInput('triggered_by_user_id');
  const apiBase = core.getInput('api_base');
  const pollIntervalSeconds = parseInt(core.getInput('poll_interval_seconds'), 10);
  const timeoutMinutes = parseInt(core.getInput('timeout_minutes'), 10);
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;

  const body: {
    suiteId: string;
    spaceId: string;
    environmentId?: string;
    browser?: string;
    triggeredByUserId?: string;
  } = { suiteId, spaceId };
  if (environmentId !== '') {
    body.environmentId = environmentId;
  }
  if (browser !== '') {
    body.browser = browser;
  }
  if (triggeredByUserId !== '') {
    body.triggeredByUserId = triggeredByUserId;
  }

  const runResponse = await fetch(`${apiBase}/suites/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!runResponse.ok) {
    throw new Error(`POST /suites/run failed: ${runResponse.status}`);
  }
  const startJson = (await runResponse.json()) as { suiteRunId: string };
  const suiteRunId = startJson.suiteRunId;
  core.setOutput('suite_run_id', suiteRunId);

  const deadline = Date.now() + timeoutMinutes * 60 * 1000;
  let lastRuns: RunRow[] = [];

  while (true) {
    if (Date.now() >= deadline) {
      if (summaryPath) {
        writeSummary(
          summaryPath,
          `## Loopvise suite\n\n**Suite run ID:** \`${suiteRunId}\`\n\n${runsTable(lastRuns)}\n**Result:** Timed out after ${timeoutMinutes} minutes.\n`,
        );
      }
      core.setFailed(`Timed out after ${timeoutMinutes} minutes`);
      process.exit(1);
    }

    const statusResponse = await fetch(`${apiBase}/suites/run/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suiteRunId }),
    });
    if (!statusResponse.ok) {
      throw new Error(`POST /suites/run/status failed: ${statusResponse.status}`);
    }
    const statusJson = (await statusResponse.json()) as StatusResponse;
    const runs = statusJson.runs ?? [];
    lastRuns = runs;

    if (summaryPath) {
      writeSummary(
        summaryPath,
        `## Loopvise suite\n\n**Suite run ID:** \`${suiteRunId}\`\n\n${runsTable(runs)}`,
      );
    }

    const runningCount = runs.filter(
      (row) =>
        row.status === 'pending' ||
        row.status === 'queued' ||
        row.status === 'running',
    ).length;

    if (runs.length === 0 || runningCount > 0) {
      await sleep(pollIntervalSeconds * 1000);
      continue;
    }

    const failedStatusCount = runs.filter(
      (row) =>
        row.status === 'failed' ||
        row.status === 'error' ||
        row.status === 'cancelled',
    ).length;
    const failedCheckCount = runs.reduce((count, row) => {
      const checks = row.check_results ?? [];
      return count + checks.filter((check) => check.succeeded === false).length;
    }, 0);

    if (failedStatusCount > 0 || failedCheckCount > 0) {
      if (summaryPath) {
        writeSummary(
          summaryPath,
          `## Loopvise suite\n\n**Suite run ID:** \`${suiteRunId}\`\n\n${runsTable(runs)}\n**Result:** Failed.\n${failureBlocks(runs)}`,
        );
      }
      core.setFailed('Suite run failed');
      process.exit(1);
    }

    if (summaryPath) {
      writeSummary(
        summaryPath,
        `## Loopvise suite\n\n**Suite run ID:** \`${suiteRunId}\`\n\n${runsTable(runs)}\n**Result:** Passed.\n`,
      );
    }
    return;
  }
}

void run();
