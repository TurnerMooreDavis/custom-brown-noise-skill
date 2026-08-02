#!/usr/bin/env node
/* *
 * Local AudioPlayer device simulator.
 *
 * Drives the real Lambda handler through a full playback session the way an
 * Echo would: launch, PlaybackStarted, then repeated PlaybackNearlyFinished /
 * PlaybackFinished cycles. Crucially it enforces Alexa's queueing rule - an
 * ENQUEUE whose expectedPreviousToken does not match the token currently
 * playing is DROPPED - which is what silently ended playback after two tracks.
 *
 * This makes a 24-hour hardware failure reproducible in milliseconds.
 *
 *   node scripts/simulate.js lilt
 *   node scripts/simulate.js lilt --cycles 50
 *   node scripts/simulate.js all --quiet
 * */

const { handler } = require("../lambda/index.js");
const { SKILLS } = require("../lambda/skills.js");

const BY_KEY = Object.fromEntries(
    Object.entries(SKILLS).map(([id, config]) => [config.key, { id, config }]),
);

function parseArgs(argv) {
    const positional = argv.filter((a) => !a.startsWith("--"));
    const cyclesFlag = argv.indexOf("--cycles");
    return {
        target: positional[0] || "all",
        cycles: cyclesFlag === -1 ? 10 : Number(argv[cyclesFlag + 1]),
        quiet: argv.includes("--quiet"),
    };
}

const envelope = (request, applicationId) => ({
    version: "1.0",
    context: {
        System: {
            application: { applicationId },
            user: { userId: "amzn1.ask.account.simulator" },
            device: {
                deviceId: "simulated-echo",
                supportedInterfaces: { AudioPlayer: {} },
            },
        },
    },
    request,
});

function invoke(request, applicationId) {
    return new Promise((resolve, reject) => {
        handler(envelope(request, applicationId), {}, (err, response) =>
            err ? reject(err) : resolve(response),
        );
    });
}

const playDirective = (response) =>
    (response?.response?.directives || []).find(
        (d) => d.type === "AudioPlayer.Play",
    );

/**
 * Runs one skill through `cycles` loop iterations. Returns a report rather than
 * throwing, so the caller can summarise every skill before exiting non-zero.
 */
async function simulateSkill(key, cycles, quiet) {
    const entry = BY_KEY[key];
    if (!entry) {
        throw new Error(
            `Unknown skill "${key}". Known: ${Object.keys(BY_KEY).join(", ")}`,
        );
    }
    const { id: skillId, config } = entry;
    // Write directly to stdout: console.log is stubbed out while the handler
    // runs so its verbose logging does not drown the simulation trace.
    const log = (msg) => !quiet && process.stdout.write(`${msg}\n`);

    log(`\n=== ${key} (${config.spokenName}) ===`);

    // --- Launch -----------------------------------------------------------
    const launch = await invoke(
        { type: "LaunchRequest", requestId: "sim-launch", locale: "en-US" },
        skillId,
    );
    const first = playDirective(launch);
    if (!first) {
        return {
            key,
            ok: false,
            cycles: 0,
            reason: "launch produced no Play directive",
        };
    }
    if (first.playBehavior !== "REPLACE_ALL") {
        return {
            key,
            ok: false,
            cycles: 0,
            reason: `launch used ${first.playBehavior}, expected REPLACE_ALL`,
        };
    }

    let nowPlaying = first.audioItem.stream.token;
    log(`  launch      -> play ${first.audioItem.stream.url.split("/").pop()}`);
    log(`                 token ${nowPlaying}`);

    await invoke(
        {
            type: "AudioPlayer.PlaybackStarted",
            requestId: "sim-started",
            token: nowPlaying,
        },
        skillId,
    );

    // --- Loop -------------------------------------------------------------
    for (let cycle = 1; cycle <= cycles; cycle++) {
        const nearly = await invoke(
            {
                type: "AudioPlayer.PlaybackNearlyFinished",
                requestId: `sim-nearly-${cycle}`,
                token: nowPlaying,
                offsetInMilliseconds: 1,
            },
            skillId,
        );

        const enqueue = playDirective(nearly);
        if (!enqueue) {
            return {
                key,
                ok: false,
                cycles: cycle - 1,
                reason: `cycle ${cycle}: no Play directive returned, queue left empty`,
            };
        }
        if (enqueue.playBehavior !== "ENQUEUE") {
            return {
                key,
                ok: false,
                cycles: cycle - 1,
                reason: `cycle ${cycle}: expected ENQUEUE, got ${enqueue.playBehavior}`,
            };
        }

        // Alexa's rule: mismatched expectedPreviousToken means the directive is
        // silently discarded and nothing is queued behind the current track.
        const expected = enqueue.audioItem.stream.expectedPreviousToken;
        if (expected !== nowPlaying) {
            return {
                key,
                ok: false,
                cycles: cycle - 1,
                reason:
                    `cycle ${cycle}: ENQUEUE dropped by Alexa - expectedPreviousToken ` +
                    `"${expected}" does not match the playing token "${nowPlaying}"`,
            };
        }

        const queued = enqueue.audioItem.stream.token;

        // Current track ends; the queued one becomes current.
        await invoke(
            {
                type: "AudioPlayer.PlaybackFinished",
                requestId: `sim-finished-${cycle}`,
                token: nowPlaying,
            },
            skillId,
        );
        nowPlaying = queued;
        await invoke(
            {
                type: "AudioPlayer.PlaybackStarted",
                requestId: `sim-started-${cycle}`,
                token: nowPlaying,
            },
            skillId,
        );

        log(`  cycle ${String(cycle).padStart(3)}  -> queued ${nowPlaying}`);
    }

    return { key, ok: true, cycles, reason: null };
}

(async () => {
    const { target, cycles, quiet } = parseArgs(process.argv.slice(2));

    if (!Number.isInteger(cycles) || cycles < 1) {
        console.error("error: --cycles must be a positive integer");
        process.exit(2);
    }

    const keys = target === "all" ? Object.keys(BY_KEY) : [target];

    // The handler logs verbosely on every request; stub console.log for the
    // duration so only the simulation trace reaches stdout.
    const realLog = console.log;
    const realWarn = console.warn;
    console.log = () => {};
    console.warn = () => {};

    const reports = [];
    try {
        for (const key of keys) {
            reports.push(await simulateSkill(key, cycles, quiet));
        }
    } finally {
        console.log = realLog;
        console.warn = realWarn;
    }

    const out = (msg) => process.stdout.write(`${msg}\n`);
    out("\n--------------------------------------------------");
    let failed = false;
    for (const r of reports) {
        if (r.ok) {
            out(`PASS  ${r.key.padEnd(6)} sustained ${r.cycles} loop cycles`);
        } else {
            failed = true;
            out(`FAIL  ${r.key.padEnd(6)} stopped after ${r.cycles} cycle(s)`);
            out(`        ${r.reason}`);
        }
    }
    out("--------------------------------------------------");
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error(`simulation error: ${err.message}`);
    process.exit(2);
});
