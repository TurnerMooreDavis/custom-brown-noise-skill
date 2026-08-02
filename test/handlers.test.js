const {
    SKILLS,
    SKILL_IDS,
    launchRequest,
    intentRequest,
    audioPlayerRequest,
    invoke,
    directives,
} = require("./helpers");

// Silence the handlers' console logging during tests.
beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(() => {
    jest.restoreAllMocks();
});

const SKILL_TABLE = Object.entries(SKILLS).map(([id, config]) => [
    config.key,
    id,
    config,
]);

describe("per-skill configuration", () => {
    it.each(SKILL_TABLE)(
        "%s plays its own track on launch",
        async (_key, skillId, config) => {
            const response = await invoke(launchRequest(), skillId);
            const [directive] = directives(response);

            expect(directive.type).toBe("AudioPlayer.Play");
            expect(directive.playBehavior).toBe("REPLACE_ALL");
            expect(directive.audioItem.stream.url).toBe(config.audioUrl);
            expect(directive.audioItem.stream.token).toBe(config.audioToken);
            expect(response.response.shouldEndSession).toBe(true);
        },
    );

    it.each(SKILL_TABLE)(
        "%s uses its own spoken name in help",
        async (_key, skillId, config) => {
            const response = await invoke(
                intentRequest("AMAZON.HelpIntent"),
                skillId,
            );

            expect(response.response.outputSpeech.ssml).toContain(
                config.spokenName,
            );
        },
    );

    it("fails loudly for an unrecognised applicationId", async () => {
        const response = await invoke(
            launchRequest(),
            "amzn1.ask.skill.not-a-real-skill",
        );

        // The ErrorHandler catches the thrown config error and speaks an apology
        // rather than serving another skill's audio.
        expect(directives(response)).toHaveLength(0);
        expect(response.response.outputSpeech.ssml).toContain("trouble");
    });
});

describe("launch and play", () => {
    it("handles the PlayBrownNoise intent the same as a launch", async () => {
        const config = SKILLS[SKILL_IDS[0]];
        const response = await invoke(intentRequest("PlayBrownNoise"));
        const [directive] = directives(response);

        expect(directive.type).toBe("AudioPlayer.Play");
        expect(directive.audioItem.stream.url).toBe(config.audioUrl);
    });
});

describe("stop, cancel and pause", () => {
    it.each([
        "AMAZON.StopIntent",
        "AMAZON.CancelIntent",
        "AMAZON.PauseIntent",
        "AMAZON.NavigateHomeIntent",
    ])("issues a Stop directive for %s", async (intentName) => {
        const response = await invoke(intentRequest(intentName));
        const [directive] = directives(response);

        expect(directive.type).toBe("AudioPlayer.Stop");
        expect(response.response.shouldEndSession).toBe(true);
    });

    it.each([
        "PlaybackController.PauseCommandIssued",
        "PlaybackController.StopCommandIssued",
    ])("issues a Stop directive for %s", async (requestType) => {
        const response = await invoke({ type: requestType, requestId: "test" });
        const [directive] = directives(response);

        expect(directive.type).toBe("AudioPlayer.Stop");
    });
});

describe("resume", () => {
    it("restarts the main track on AMAZON.ResumeIntent", async () => {
        const config = SKILLS[SKILL_IDS[0]];
        const response = await invoke(intentRequest("AMAZON.ResumeIntent"));
        const [directive] = directives(response);

        expect(directive.type).toBe("AudioPlayer.Play");
        expect(directive.playBehavior).toBe("REPLACE_ALL");
        expect(directive.audioItem.stream.url).toBe(config.audioUrl);
    });
});

describe("looping", () => {
    // Regression test for the bug that stopped playback after two tracks:
    // expectedPreviousToken was a fixed constant, so it stopped matching as soon
    // as the enqueued token picked up a timestamp suffix.
    it("echoes the currently playing token as expectedPreviousToken", async () => {
        const currentToken = "s3AudioFileTokenBasic-1761000000000";
        const response = await invoke(
            audioPlayerRequest(
                "AudioPlayer.PlaybackNearlyFinished",
                currentToken,
            ),
        );
        const [directive] = directives(response);

        expect(directive.playBehavior).toBe("ENQUEUE");
        expect(directive.audioItem.stream.expectedPreviousToken).toBe(
            currentToken,
        );
    });

    it("keeps looping across repeated cycles", async () => {
        let currentToken = SKILLS[SKILL_IDS[0]].audioToken;

        // Three consecutive loops, each feeding the previous directive's token
        // back in the way a real device would.
        for (let cycle = 0; cycle < 3; cycle++) {
            const response = await invoke(
                audioPlayerRequest(
                    "AudioPlayer.PlaybackNearlyFinished",
                    currentToken,
                ),
            );
            const [directive] = directives(response);

            expect(directive).toBeDefined();
            expect(directive.playBehavior).toBe("ENQUEUE");
            expect(directive.audioItem.stream.expectedPreviousToken).toBe(
                currentToken,
            );

            currentToken = directive.audioItem.stream.token;
        }
    });

    it("aborts the loop without a directive when the token is missing", async () => {
        const response = await invoke(
            audioPlayerRequest("AudioPlayer.PlaybackNearlyFinished", undefined),
        );

        expect(directives(response)).toHaveLength(0);
    });

    it("acknowledges passive AudioPlayer events without a directive", async () => {
        const response = await invoke(
            audioPlayerRequest("AudioPlayer.PlaybackStopped", "any-token"),
        );

        expect(directives(response)).toHaveLength(0);
    });
});

describe("standard intents", () => {
    it("speaks a fallback message for AMAZON.FallbackIntent", async () => {
        const response = await invoke(intentRequest("AMAZON.FallbackIntent"));

        expect(response.response.outputSpeech.ssml).toContain("Sorry");
    });

    it("acknowledges SessionEndedRequest without directives", async () => {
        const response = await invoke({
            type: "SessionEndedRequest",
            requestId: "test",
            reason: "USER_INITIATED",
        });

        expect(directives(response)).toHaveLength(0);
    });
});
