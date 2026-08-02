/* *
 * Custom Brown Noise Skill Logic - Plays MP3 from S3 on Launch or Intent
 * Uses CommonJS (require/exports) syntax for compatibility with Alexa-Hosted Lambda.
 *
 * Shared by all three brown noise skills. Everything that differs between them
 * (audio track, spoken name, token prefix) comes from lambda/skills.js, keyed
 * by the applicationId on the incoming request.
 * */
const Alexa = require("ask-sdk-core");
const { getSkillConfig } = require("./skills");

// =========================================================================================
// 1. PLAY HANDLER
// =========================================================================================
const PlayBrownNoiseIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        const isLaunch = request.type === "LaunchRequest";
        const isPlayIntent =
            request.type === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) ===
                "PlayBrownNoise";

        return isLaunch || isPlayIntent;
    },
    handle(handlerInput) {
        const { audioUrl, audioToken, key } = getSkillConfig(
            handlerInput.requestEnvelope,
        );
        console.log(`~~~~ PlayBrownNoiseHandler: Starting track for "${key}".`);

        return handlerInput.responseBuilder
            .addAudioPlayerPlayDirective("REPLACE_ALL", audioUrl, audioToken, 0)
            .withShouldEndSession(true)
            .getResponse();
    },
};

// =========================================================================================
// 2. ROBUST STOP/PAUSE HANDLER
// =========================================================================================
const CancelStopAndPauseIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        const isIntent =
            request.type === "IntentRequest" &&
            (Alexa.getIntentName(handlerInput.requestEnvelope) ===
                "AMAZON.CancelIntent" ||
                Alexa.getIntentName(handlerInput.requestEnvelope) ===
                    "AMAZON.StopIntent" ||
                Alexa.getIntentName(handlerInput.requestEnvelope) ===
                    "AMAZON.PauseIntent" ||
                Alexa.getIntentName(handlerInput.requestEnvelope) ===
                    "AMAZON.NavigateHomeIntent");

        const isPlaybackCommand =
            request.type === "PlaybackController.PauseCommandIssued" ||
            request.type === "PlaybackController.StopCommandIssued";

        if (isIntent || isPlaybackCommand) {
            console.log(
                `~~~~ CancelStopAndPauseIntentHandler: Handling request type: ${request.type}`,
            );
        }

        return isIntent || isPlaybackCommand;
    },
    handle(handlerInput) {
        const speakOutput = "Brown noise playback stopped. Goodbye.";
        console.log(
            "~~~~ CancelStopAndPauseIntentHandler: Issuing AudioPlayer.Stop directive.",
        );

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .addAudioPlayerStopDirective()
            .withShouldEndSession(true)
            .getResponse();
    },
};

// =========================================================================================
// 3. RESUME HANDLER
// =========================================================================================
const ResumeIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        const isIntent =
            request.type === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) ===
                "AMAZON.ResumeIntent";
        const isPlaybackCommand =
            request.type === "PlaybackController.PlayCommandIssued";
        const isSkipCommand =
            request.type === "PlaybackController.NextCommandIssued" ||
            request.type === "PlaybackController.PreviousCommandIssued";

        if (isIntent || isPlaybackCommand || isSkipCommand) {
            console.log(
                `~~~~ ResumeIntentHandler: Handling request type: ${request.type}`,
            );
        }

        return isIntent || isPlaybackCommand || isSkipCommand;
    },
    handle(handlerInput) {
        const { audioUrl, audioToken } = getSkillConfig(
            handlerInput.requestEnvelope,
        );
        console.log(
            "~~~~ ResumeIntentHandler: Issuing AudioPlayer.Play directive.",
        );

        // Resume playback logic - OFFSET is 0 to restart the full loop
        return handlerInput.responseBuilder
            .addAudioPlayerPlayDirective("REPLACE_ALL", audioUrl, audioToken, 0)
            .withShouldEndSession(true)
            .getResponse();
    },
};

// =========================================================================================
// 4. PLAYBACK NEARLY FINISHED HANDLER (Handles Looping)
// =========================================================================================
const PlaybackNearlyFinishedHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) ===
            "AudioPlayer.PlaybackNearlyFinished"
        );
    },
    handle(handlerInput) {
        const { audioUrl, audioToken } = getSkillConfig(
            handlerInput.requestEnvelope,
        );

        // expectedPreviousToken MUST be the token of the stream that is playing
        // right now, not a fixed constant. Alexa silently drops an ENQUEUE whose
        // expectedPreviousToken does not match the current token, which stops
        // playback at the end of the current track.
        const lastToken = handlerInput.requestEnvelope.request?.token;

        // Guard clause: If the token is missing for any reason, log it and exit gracefully.
        // This prevents sending a malformed directive that would stop playback entirely.
        if (!lastToken) {
            console.warn(
                "!!!! PlaybackNearlyFinishedHandler: No token found in request. Looping aborted to prevent crash.",
            );
            return handlerInput.responseBuilder.getResponse();
        }

        const newAudioToken = `${audioToken}-${Date.now()}`;

        console.log(
            `~~~~ PlaybackNearlyFinishedHandler: Enqueuing next track. Previous: ${lastToken}, New: ${newAudioToken}`,
        );

        return handlerInput.responseBuilder
            .addAudioPlayerPlayDirective(
                "ENQUEUE",
                audioUrl,
                newAudioToken,
                0,
                lastToken, // Required for queue continuity
            )
            .getResponse();
    },
};

// =========================================================================================
// 5-8. PASSIVE, SYSTEM, AND STANDARD HANDLERS
// =========================================================================================

const PlaybackStartedHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) ===
            "AudioPlayer.PlaybackStarted"
        );
    },
    handle(handlerInput) {
        console.log(
            "~~~~ PlaybackStartedHandler: Audio stream confirmed started.",
        );
        return handlerInput.responseBuilder.getResponse();
    },
};

const PassiveAudioPlayerHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith(
            "AudioPlayer.",
        );
    },
    handle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        console.log(
            `~~~~ PassiveAudioPlayerHandler: Acknowledging final AudioPlayer event: ${requestType}`,
        );

        return handlerInput.responseBuilder.getResponse();
    },
};

const SystemEventHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope).startsWith(
            "System.",
        );
    },
    handle(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        console.log(
            `~~~~ SystemEventHandler: Acknowledging System event: ${requestType}`,
        );

        if (requestType === "System.ExceptionEncountered") {
            const error = handlerInput.requestEnvelope.request.error;
            console.error(
                `!!!! System.ExceptionEncountered caught. Message: ${error.message} - Type: ${error.type}`,
            );
        }

        return handlerInput.responseBuilder.getResponse();
    },
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return (
            request.type === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) ===
                "AMAZON.HelpIntent"
        );
    },
    handle(handlerInput) {
        const { spokenName } = getSkillConfig(handlerInput.requestEnvelope);
        const speakOutput = `I can play the ${spokenName} for you. Just say 'play brown noise'.`;
        console.log("~~~~ HelpIntentHandler: Providing help output.");

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return (
            request.type === "IntentRequest" &&
            Alexa.getIntentName(handlerInput.requestEnvelope) ===
                "AMAZON.FallbackIntent"
        );
    },
    handle(handlerInput) {
        const speakOutput =
            'Sorry, I don\'t know that command. Try saying "play brown noise" or "stop".';
        console.log(
            "~~~~ FallbackIntentHandler: Triggered by unmatched request.",
        );

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return (
            Alexa.getRequestType(handlerInput.requestEnvelope) ===
            "SessionEndedRequest"
        );
    },
    handle(handlerInput) {
        console.log(
            `~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`,
        );
        return handlerInput.responseBuilder.getResponse();
    },
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput =
            "Sorry, I had trouble doing what you asked. Please try again.";
        console.log(`\n\n!!!! UNHANDLED ERROR - CRITICAL !!!\n\n`);
        console.log(`Error Handled: ${error.name}: ${error.message}`);
        if (error.stack) {
            console.log(`Stack Trace: ${error.stack}`);
        }
        if (handlerInput.requestEnvelope) {
            console.log(
                `Failed Request Type: ${Alexa.getRequestType(handlerInput.requestEnvelope)}`,
            );
        }
        console.log(`\n\n!!!! UNHANDLED ERROR - CRITICAL !!!\n\n`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    },
};

// =========================================================================================
// 9. REQUEST INTERCEPTOR AND HANDLER EXPORT CHAIN
// =========================================================================================

const LoggingRequestInterceptor = {
    process(handlerInput) {
        const requestType = Alexa.getRequestType(handlerInput.requestEnvelope);
        const intentName =
            requestType === "IntentRequest"
                ? Alexa.getIntentName(handlerInput.requestEnvelope)
                : "N/A";
        console.log(`\n================= REQUEST RECEIVED =================`);
        console.log(`Request Type: ${requestType}`);
        console.log(`Intent Name: ${intentName}`);
        console.log(`====================================================\n`);
    },
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        // 1. Intents (Launch, Play) are prioritized first
        PlayBrownNoiseIntentHandler,

        // 2. Control Intents (Stop, Pause, Resume)
        CancelStopAndPauseIntentHandler,
        ResumeIntentHandler,

        // 3. Audio Player Logic is prioritized next
        PlaybackStartedHandler,
        PlaybackNearlyFinishedHandler,
        PassiveAudioPlayerHandler,

        // 4. System and General handlers are last
        SystemEventHandler,
        HelpIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
    )
    .addRequestInterceptors(LoggingRequestInterceptor)
    .addErrorHandlers(ErrorHandler)
    .withCustomUserAgent("custom-brown-noise/v2")
    .lambda();
