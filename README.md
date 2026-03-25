# loopvise-github-action

Composite action that calls Loopvise `POST /suites/run`, polls `POST /suites/run/status`, and fails the job if any run is failed/error/cancelled or any check has `succeeded: false`.

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
```

Replace `alexriestech` / `main` with your fork and the ref you want.

3. Optional inputs: `environment_id`, `browser`, `triggered_by_user_id`, `api_base`, `poll_interval_seconds`, `timeout_minutes`.
4. Output: `suite_run_id` (from the action step’s `outputs`).

No API key is sent today; when Loopvise adds auth, this action will be extended to accept a secret and send the appropriate header.

## Try it in this repository

Actions → **Run Loopvise suite (example)** → **Run workflow** → fill `suite_id`, `space_id`, and optionally `environment_id`.

## Publish for others

- Push these files to GitHub.
- Optional: create a release tag (for example `v1`) so consumers can use `@v1` instead of `@main`.
