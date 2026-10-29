# scripts

`newman-trend-metrics.js` reads a Newman JSON report and emits two things: a GitHub Actions job-summary table (to `$GITHUB_STEP_SUMMARY`) whose Result verdict reflects all Newman failures (failed assertions, failed requests, or run-level failures), and a benchmark-action-compatible metrics file for the trend chart. Run the dependency-free test for the verdict logic with `node scripts/newman-trend-metrics.test.js`.
