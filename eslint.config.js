const js = require("@eslint/js");
const jest = require("eslint-plugin-jest");
const prettier = require("eslint-config-prettier");

module.exports = [
    {
        ignores: ["node_modules/**", "coverage/**"],
    },
    js.configs.recommended,
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                console: "readonly",
                exports: "writable",
                module: "writable",
                require: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                // Global since Node 18; used by scripts/check-audio.js
                fetch: "readonly",
            },
        },
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
            eqeqeq: ["error", "always"],
            "no-console": "off",
        },
    },
    {
        files: ["**/*.test.js", "test/**/*.js"],
        plugins: { jest },
        languageOptions: {
            globals: jest.environments.globals.globals,
        },
        rules: jest.configs.recommended.rules,
    },
    prettier,
];
