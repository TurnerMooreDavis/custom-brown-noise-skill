#!/usr/bin/env node
/* *
 * Verifies every configured audio URL is reachable and looks like streamable
 * MP3. A dead or misconfigured S3 object is indistinguishable from a code bug
 * when you are testing on a device, so check it directly.
 *
 * Alexa requires HTTPS and expects the endpoint to support range requests.
 *
 *   node scripts/check-audio.js
 * */

const { SKILLS } = require("../lambda/skills.js");

const MB = 1024 * 1024;

async function check(config) {
    const result = { key: config.key, url: config.audioUrl, problems: [] };

    if (!config.audioUrl.startsWith("https://")) {
        result.problems.push("URL is not HTTPS - Alexa will refuse to play it");
    }

    let response;
    try {
        // Range request: confirms range support and avoids pulling the whole file.
        response = await fetch(config.audioUrl, {
            method: "GET",
            headers: { Range: "bytes=0-1023" },
        });
    } catch (err) {
        result.problems.push(`request failed: ${err.message}`);
        return result;
    }

    result.status = response.status;
    result.contentType = response.headers.get("content-type");
    result.acceptsRanges = response.status === 206;

    const totalBytes = (() => {
        const contentRange = response.headers.get("content-range");
        if (contentRange && contentRange.includes("/")) {
            const total = Number(contentRange.split("/")[1]);
            return Number.isFinite(total) ? total : null;
        }
        const length = response.headers.get("content-length");
        return length ? Number(length) : null;
    })();
    result.totalBytes = totalBytes;

    if (response.status !== 200 && response.status !== 206) {
        result.problems.push(`HTTP ${response.status}`);
    }
    if (
        result.contentType &&
        !/audio|mpeg|octet-stream/i.test(result.contentType)
    ) {
        result.problems.push(`unexpected content-type "${result.contentType}"`);
    }
    if (!result.acceptsRanges) {
        result.problems.push(
            "server did not honour a range request (returned 200, not 206)",
        );
    }

    // Rough duration sanity check assuming a constant bitrate around 128 kbps.
    if (totalBytes) {
        result.approxHours = (totalBytes * 8) / (128 * 1000) / 3600;
    }

    return result;
}

(async () => {
    const results = [];
    for (const config of Object.values(SKILLS)) {
        results.push(await check(config));
    }

    let failed = false;
    for (const r of results) {
        const size = r.totalBytes
            ? `${(r.totalBytes / MB).toFixed(1)} MB`
            : "unknown size";
        const hours = r.approxHours
            ? `~${r.approxHours.toFixed(1)}h @128kbps`
            : "";
        console.log(`\n${r.key}  ${r.url.split("/").pop()}`);
        console.log(
            `  status ${r.status ?? "-"}  ${r.contentType ?? ""}  ${size}  ${hours}`,
        );
        if (r.problems.length) {
            failed = true;
            for (const p of r.problems) console.log(`  PROBLEM: ${p}`);
        } else {
            console.log("  OK");
        }
    }

    console.log("");
    process.exit(failed ? 1 : 0);
})().catch((err) => {
    console.error(`check-audio error: ${err.message}`);
    process.exit(2);
});
