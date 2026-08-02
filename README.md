# Custom Brown Noise Skill

One shared Alexa AudioPlayer Lambda serving three Alexa-hosted skills. The skills
differ only by audio track, spoken name and token prefix, so the code is identical
across all three and selects its configuration at runtime from the `applicationId`
on the incoming request.

| Key     | Skill             | Invocation name      | Audio                    |
| ------- | ----------------- | -------------------- | ------------------------ |
| `notag` | notag brown noise | "basic brown noise"  | 1 hour, no intro         |
| `lilt`  | lil t brown noise | "custom brown noise" | 12 hours, intro baked in |
| `caleb` | caleb brown noise | "caleb brown noise"  | 12 hours, intro baked in |

The intros are part of the MP3 files themselves, not separate audio directives.

## Layout

```
lambda/           Shared Lambda source - deployed verbatim to all three skills
  index.js        Request handlers
  skills.js       Per-skill config, keyed by applicationId
  package.json    Runtime dependencies only
skills/<key>/skill-package/
                  Per-skill interaction model and manifest
scripts/deploy.sh Deploy one skill to its hosted CodeCommit repo
test/             Jest tests, run against the real exported handler
package.json      Dev tooling only - never deployed
```

Dev tooling lives at the repo root, deliberately separate from `lambda/package.json`,
so the Alexa-hosted build never installs jest or eslint.

## Development

```bash
npm install
npm test           # jest
npm run lint       # eslint
npm run format     # prettier --write
npm run check-all  # all three, in order
```

## Deploying

Alexa-hosted skills build and deploy on every push to their CodeCommit `master`,
so a push is a live deployment. Requires the `ask` CLI on PATH and a configured
profile (`ask configure`).

```bash
./scripts/deploy.sh lilt          # dry run - shows what would change
./scripts/deploy.sh lilt --push   # deploy live
```

Each skill has its own CodeCommit repo; the script copies `lambda/` plus that
skill's `skill-package/` into a fresh clone and pushes.

## Notes

- **Looping.** `AudioPlayer.PlaybackNearlyFinished` enqueues the next copy of the
  track. `expectedPreviousToken` must be the token of the stream currently
  playing - Alexa silently drops an `ENQUEUE` whose `expectedPreviousToken` does
  not match, which ends playback at the end of the current track.
- **Baked-in intros.** Because the intro is inside the MP3, a working loop replays
  the intro on every repeat (every 12 hours for `lilt` and `caleb`).
- **Runtime.** All three skills currently run `nodejs16.x`, which is past end of
  life and should be upgraded in the developer console.
