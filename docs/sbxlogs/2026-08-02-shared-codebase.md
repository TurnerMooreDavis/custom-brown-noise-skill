# Consolidate three brown noise skills onto one shared Lambda

**Date:** 2026-08-02

## Summary

The GitHub repo held a single `index.js` with no `package.json`, no tests and no
interaction model. It was also stale: a snapshot from 2025-10-19 that captured an
abandoned experiment, while the live skill had moved on.

This change reconciles the repo with the live Alexa-hosted code, consolidates all
three brown noise skills onto one shared Lambda, and adds a dev toolchain.

## What the investigation found

Three Alexa-hosted skills exist on the account, all running `nodejs16.x`:

| Key     | Skill             | Invocation           | Audio                         |
| ------- | ----------------- | -------------------- | ----------------------------- |
| `notag` | notag brown noise | "basic brown noise"  | `brown-noise-hour-3.mp3`      |
| `lilt`  | lil t brown noise | "custom brown noise" | `brown-noise-twelve-hour.mp3` |
| `caleb` | caleb brown noise | "caleb brown noise"  | `caleb-goodnight-2.mp3`       |

`caleb` and `lilt` were byte-identical apart from three constants. `notag` differed
only in those constants plus a fix to the looping handler.

**Repo vs live.** GitHub's commit (2025-10-19 20:14 UTC) predated a live change on
2025-10-21 that removed the separate welcome-clip logic and switched `lilt` to the
twelve-hour track. Intros are baked into the MP3s, so the separate welcome directive
was redundant.

**Two bugs in the GitHub version:**

1. `addAudioPlayerPlayDirective`'s 6th parameter is `audioItemMetadata`, not a second
   stream. Passing a stream item there emitted an inert `metadata` blob and the main
   track was never enqueued. Already resolved live on 2025-10-21.
2. `expectedPreviousToken` was a fixed constant while the enqueued token carried a
   timestamp suffix, so it stopped matching after one loop and Alexa dropped the
   `ENQUEUE`. Playback died after two tracks. Fixed live in `notag` on 2026-04-01 but
   never propagated to `lilt` or `caleb`.

## Architectural decisions

**One Lambda, runtime skill selection.** The skills differ only by audio URL, spoken
name and token prefix. Rather than three forks or build-time substitution, the shared
handler resolves its config from `context.System.application.applicationId`. The same
bytes deploy to all three, so a fix cannot land in one skill and miss the others —
which is exactly how bug 2 survived four months.

**Fail loudly on unknown applicationId.** `getSkillConfig` throws rather than falling
back to a default skill. Serving the wrong audio is harder to diagnose than a clear
error in CloudWatch.

**Dev tooling split from runtime deps.** Root `package.json` holds jest/eslint/prettier;
`lambda/package.json` holds only `ask-sdk-core` and `ask-sdk-model`. The Alexa-hosted
build runs against `lambda/` and never installs the dev toolchain.

**Interaction models vendored per skill.** `skills/<key>/skill-package/` keeps each
model and manifest in git, so voice model changes are reviewable alongside code.

**Deploy stays manual.** `scripts/deploy.sh` dry-runs by default. A push to a hosted
skill's CodeCommit `master` is a live deployment, so it requires an explicit `--push`.

## Changes

- Restructured to `lambda/` + `skills/<key>/skill-package/` (Alexa-hosted layout)
- Adopted live code as source of truth; dropped the abandoned welcome-clip logic
- Propagated the loop fix from `notag` to `lilt` and `caleb`
- Removed the `aws-sdk` v2 dependency (support ended Sept 2025); it was only used by
  the hosted template's `util.js`, which nothing imported
- Bumped `ask-sdk-core` `^2.7.0` -> `^2.14.0`
- `notag` help text now uses the invocation name ("basic brown noise") rather than the
  console display name
- Added jest (21 tests), eslint 10 flat config, prettier, README and deploy script

## Verification

All 30 live-vs-shared response pairs were diffed across three skills and ten request
types. Only three differed, all intended: the loop fix in `lilt` and `caleb`, and the
`notag` help wording. Vendored interaction models were confirmed semantically identical
to live after formatting.

## Not done

- No deployment. All three skills still run the old code.
- `nodejs16.x` is past end of life on all three and needs a console-side runtime upgrade.
- Baked-in intros will replay on every loop once looping works; deferred by request.
