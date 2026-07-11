### CI — fix auto-merge reliability (was up to 15 min late, sometimes never fired)
- `ci.yml` and `pr-quality.yml` now each dispatch `auto-merge.yml` directly via `workflow_dispatch` the moment their own jobs finish, instead of relying solely on `workflow_run` chaining — which only reliably fires for push-triggered runs, not `pull_request`-triggered ones (already documented in `auto-merge.yml`, but never actually worked around until now).
- Shortens the `auto-merge.yml` scheduled fallback poller from every 15 minutes to every 5 minutes (GitHub's minimum interval), in case the direct dispatch itself ever fails to fire.
- Net effect: a PR labeled `auto-merge` should now merge within seconds of its checks finishing, instead of waiting for the next cron tick.
