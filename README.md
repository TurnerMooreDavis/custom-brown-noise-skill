# Custom Brown Noise Skill

One shared Alexa AudioPlayer Lambda serving three Alexa-hosted skills. The skills
differ only by audio track, spoken name and token prefix, so the code is identical
across all three and selects its configuration at runtime from the `applicationId`
on the incoming request.

| Key     | Skill             | Invocation name      | Audio                    |
| ------- | ----------------- | -------------------- | ------------------------ |
| `notag` | notag brown noise | "short brown noise"  | 1 hour, no intro         |
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
npm run check-all  # lint, format, tests and the loop simulation
```

## Testing

Four levels, cheapest first. The first three need no deployment and no device.

### 1. Unit tests - `npm test`

Invokes the real exported Lambda handler with Alexa request envelopes and asserts
on the directives it returns. Covers all three skills, both playback control paths
and the looping regression.

### 2. Loop simulation - `npm run simulate`

A fake Echo that drives the handler through a full playback session, enforcing
Alexa's rule that an `ENQUEUE` whose `expectedPreviousToken` does not match the
currently playing token is silently dropped.

```bash
npm run simulate                     # all skills, 10 cycles
npm run simulate -- lilt --cycles 50 # one skill, 50 cycles
```

This matters because the looping bug took **two full tracks** to show up - 24 hours
on the twelve-hour file. The simulator reproduces it in milliseconds and exits
non-zero, so it runs as part of `check-all`.

### 3. Audio health - `npm run check:audio`

Range-requests every configured URL and checks it is HTTPS, returns `206`, and
serves an audio content type. A dead S3 object looks exactly like a code bug from
a device, so rule it out first.

### 4. Real Alexa - your phone or an Echo

Two ways to reach a real Alexa, both requiring `ask configure`:

**Text only, against the deployed skill:**

```bash
ask dialog --skill-id <skill-id> --locale en-US --stage development
```

Type utterances, see the JSON responses. It exercises the real interaction model,
so it catches utterance and intent-routing problems that unit tests cannot. It runs
the **deployed** code, not your working tree, and it will not actually play audio.

**Your phone, running local code:**

```bash
./scripts/debug.sh lilt
```

This starts an ASK local debug session. While it runs, requests to the skill's
**development** stage are re-routed from the Alexa service to the code in your
working tree, so you can say "Alexa, open custom brown noise" into the Alexa app on
your phone and have it execute what you just edited - no deploy. It is the only way
to hear the audio actually stream while still iterating locally.

Nothing is written to the skill's repo and the routing reverts as soon as you press
Ctrl-C. The script assembles a throwaway project under `.deploy/<key>/` and installs
`ask-sdk-local-debug` there only, so the debug dependency never reaches
`lambda/package.json` and never gets deployed.

Sign the Alexa app into the same developer account that owns the skill, otherwise it
will not see the development stage.

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
