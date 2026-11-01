# Re:Material — working rules

## Git workflow (always follow)
- All changes go on the branch `feature/after-testing-iterations`. Do not create a new branch for a new round.
- If the working copy is on another branch (for example after `切换到10.8测试版.cmd`), switch back to `feature/after-testing-iterations` before changing anything. Never commit app changes on `user-test-1008` or `test/remote-testers`; they are frozen test versions.
- Only exception: the switch tooling (`scripts/switch-to-*.ps1`, `切换到*.cmd`) lives on `user-test-1008` and is edited there, because the launchers read it from that branch.
- When the round is done, **only commit** on `feature/after-testing-iterations`. Do not push and do not merge. `切换到最新版.cmd` builds this branch, so committed changes show up there.
- Push the branch and merge it into `main` only after the user has tested it and says "可以合并".
- After every round, tell the user in Chinese which branch you are on and whether it has been pushed.

## Preview (always follow)
- After every round of changes, restart the preview automatically: stop this project's old preview processes (ports 3001 and 5173), then run `scripts/launch-preview.ps1 -NoBrowser`.
- End the reply with the preview link (http://localhost:5173/) and a list of "建议测试的页面" covering what changed in that round.
