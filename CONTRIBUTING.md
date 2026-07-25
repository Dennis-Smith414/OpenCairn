Contributing to OpenCairn

Thanks for your interest in contributing. OpenCairn is a free, offline-first, open-source trail app, and it stays that way because of the terms below.

Licensing

OpenCairn is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

By submitting a contribution (a pull request, patch, or any code, documentation, or other material) to this project, you agree that:

Your contribution is licensed under AGPL-3.0-or-later, the same license as the project.
You have the right to license the contribution under these terms — it is your own work, or you have permission to submit it.
You understand the project may be distributed and run as a network service under AGPL-3.0, and your contribution is included under those terms.

If your contribution includes or depends on third-party code, models, or assets, you must disclose it and confirm its license is compatible with AGPL-3.0. Anything that cannot be distributed under AGPL-3.0 (for example, model weights under a non-commercial or custom license) must be kept as a clearly separated, optional component — not merged into the core.

How to contribute
Open an issue first for anything non-trivial, so we can agree on scope before you build. This saves everyone a painful merge later.
Branch per feature. Work on a branch, open a pull request against main.
Keep PRs focused. One feature or fix per PR is much easier to review.
Match the existing style. Look at the surrounding code and follow its patterns rather than introducing new ones.
Tests should pass. Run the test suite before opening a PR. If you add functionality, add coverage for it where practical.
Scope and philosophy

OpenCairn is deliberately lean and offline-first. Before proposing a feature, consider:

Does it work without signal? Core features must function offline. Anything that requires a network connection should be optional and clearly marked.
Does it respect the user? No tracking, no interruptions, no position-based alerts. The app adjusts what it displays; it does not nag or phone home.
Is it worth the weight? Battery life, simplicity, and trust are competitive features. New dependencies and always-on background work are costs, not wins.
Questions

Open an issue or reach out via the project's Discord. Contributions of all sizes are welcome — including documentation, tests, and bug reports.
