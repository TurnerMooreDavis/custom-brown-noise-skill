/* *
 * Per-skill configuration for the shared brown noise Lambda.
 *
 * All three skills run byte-identical code. The only things that vary are the
 * audio track, the spoken skill name and the AudioPlayer token prefix, so the
 * skill identifies itself at runtime from the applicationId on the request
 * rather than needing a separate build per skill.
 *
 * The invocation name is NOT configured here - it lives in each skill's
 * interaction model under skills/<key>/skill-package/.
 * */

const SKILLS = {
    "amzn1.ask.skill.8b1db85a-e7db-483a-9e43-9164c6a0345c": {
        key: "notag",
        spokenName: "pickle watermelon",
        audioUrl:
            "https://lil-t-brown-noise.s3.us-east-1.amazonaws.com/brown-noise-hour-3.mp3",
        audioToken: "s3AudioFileTokenBasic",
    },
    "amzn1.ask.skill.3933e191-2148-4b18-abe2-b6bb2cb2f554": {
        key: "lilt",
        spokenName: "custom brown noise",
        audioUrl:
            "https://lil-t-brown-noise.s3.us-east-1.amazonaws.com/brown-noise-twelve-hour.mp3",
        audioToken: "s3AudioFileToken",
    },
    "amzn1.ask.skill.b6a15073-9729-49b1-a07e-85ed9c439e4d": {
        key: "caleb",
        spokenName: "caleb brown noise",
        audioUrl:
            "https://lil-t-brown-noise.s3.us-east-1.amazonaws.com/caleb-goodnight-2.mp3",
        audioToken: "s3AudioFileTokenCaleb",
    },
};

/**
 * Resolves the configuration for whichever skill received this request.
 * Throws loudly rather than guessing a default: serving the wrong audio track
 * is far more confusing to debug than a hard failure with a clear message.
 */
function getSkillConfig(requestEnvelope) {
    const applicationId =
        requestEnvelope?.context?.System?.application?.applicationId;

    if (!applicationId) {
        throw new Error(
            "Could not read context.System.application.applicationId from the request envelope.",
        );
    }

    const config = SKILLS[applicationId];
    if (!config) {
        throw new Error(
            `No skill configuration found for applicationId "${applicationId}". Add it to lambda/skills.js.`,
        );
    }

    return config;
}

module.exports = { SKILLS, getSkillConfig };
