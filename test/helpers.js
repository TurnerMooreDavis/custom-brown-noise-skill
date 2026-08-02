/* *
 * Test helpers: build Alexa request envelopes and invoke the exported Lambda
 * handler, returning the response as a promise.
 *
 * Every envelope carries an applicationId, because the handler resolves which
 * skill it is serving from that field.
 * */
const { handler } = require("../lambda/index.js");
const { SKILLS } = require("../lambda/skills.js");

const SKILL_IDS = Object.keys(SKILLS);
const BY_KEY = Object.fromEntries(
    Object.entries(SKILLS).map(([id, config]) => [config.key, { id, config }]),
);

function buildEnvelope(request, applicationId) {
    return {
        version: "1.0",
        context: {
            System: {
                application: { applicationId },
                user: { userId: "amzn1.ask.account.test" },
                device: {
                    deviceId: "test-device",
                    supportedInterfaces: { AudioPlayer: {} },
                },
            },
        },
        request,
    };
}

function launchRequest() {
    return { type: "LaunchRequest", requestId: "test-launch", locale: "en-US" };
}

function intentRequest(name) {
    return {
        type: "IntentRequest",
        requestId: `test-${name}`,
        locale: "en-US",
        intent: { name, confirmationStatus: "NONE" },
    };
}

function audioPlayerRequest(type, token, offsetInMilliseconds = 0) {
    return {
        type,
        requestId: `test-${type}`,
        locale: "en-US",
        token,
        offsetInMilliseconds,
    };
}

function invoke(request, applicationId = SKILL_IDS[0]) {
    return new Promise((resolve, reject) => {
        handler(buildEnvelope(request, applicationId), {}, (err, response) =>
            err ? reject(err) : resolve(response),
        );
    });
}

function directives(response) {
    return response.response.directives || [];
}

module.exports = {
    SKILLS,
    SKILL_IDS,
    BY_KEY,
    buildEnvelope,
    launchRequest,
    intentRequest,
    audioPlayerRequest,
    invoke,
    directives,
};
