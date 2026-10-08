# Re:Material — working rules

## Git workflow (always follow)
- Before starting each new round of changes, create a new branch from `main`.
- When the round is done, **only commit**. Do not push and do not merge.
- Push the branch and merge it into `main` only after the user has tested it and says "可以合并".
- After every round, tell the user in Chinese which branch you are on and whether it has been pushed.

## Preview (always follow)
- After every round of changes, restart the preview automatically: stop this project's old preview processes (ports 3001 and 5173), then run `scripts/launch-preview.ps1 -NoBrowser`.
- End the reply with the preview link (http://localhost:5173/) and a list of "建议测试的页面" covering what changed in that round.
