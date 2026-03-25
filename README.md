# loopvise-github-action

Node.js action that calls Loopvise `POST /suites/run`, polls `POST /suites/run/status`, and fails the job if any run is failed/error/cancelled or any check has `succeeded: false`.

While the job runs, it refreshes the workflow **Summary** (open the run, then the **Summary** tab) with a table of tests, statuses, and **Open** links to each run’s `runs_page_url`.

## Use in another repository

1. Create a workflow (for example `.github/workflows/loopvise.yml`).
2. Reference this repo with a branch, tag, or commit SHA (pinning a tag or SHA is best for stability).

```yaml
on:
  workflow_dispatch:
    inputs:
      suite_id: { required: true, type: string }
      space_id: { required: true, type: string }
      environment_id: { required: false, type: string, default: '' }

jobs:
  suite:
    runs-on: ubuntu-latest
    steps:
      - uses: alexriestech/loopvise-github-action@main
        with:
          suite_id: ${{ inputs.suite_id }}
          space_id: ${{ inputs.space_id }}
          environment_id: ${{ inputs.environment_id }}
          environment_url: https://platform.loopvise.com
          environment_variables: ${{ toJSON(vars.MY_LOOPVISE_VARS) }}
```

For a literal JSON object in YAML, use a single-quoted string, for example `environment_variables: '{"Email":"user@example.com"}'`.

Replace `alexriestech` / `main` with your fork and the ref you want.

3. Optional inputs: `environment_id`, `environment_url`, `environment_variables` (single-line JSON object of string values, sent as `environmentUrl` / `environmentVariables` in the API body), `browser`, `triggered_by_user_id`, `api_base`, `poll_interval_seconds`, `timeout_minutes`. Prefer [encrypted secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions) for sensitive variable values instead of hard-coding them in the workflow file.
4. Output: `suite_run_id` (from the action step’s `outputs`).

No API key is sent today; when Loopvise adds auth, this action will be extended to accept a secret and send the appropriate header.

## Developing this action

After changing `src/index.ts`, run `npm ci` and `npm run build`, then commit the updated `dist/index.js`.

## Try it in this repository

Actions → **Run Loopvise suite (example)** → **Run workflow** → fill `suite_id`, `space_id`, and optionally `environment_id`. Inspect the **Summary** tab on the run for the live table.

## Publish for others

- Push these files to GitHub.
- Optional: create a release tag (for example `v1`) so consumers can use `@v1` instead of `@main`.
