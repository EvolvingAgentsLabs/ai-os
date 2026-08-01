import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/dist-web/",
      "deploy/layers/",
      "docs/",
      "plugins/web-ui/public/",
      ".claude/",
      ".context/",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "off",

      "no-control-regex": "off",

      "no-nested-ternary": "error",
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["src/config.ts", "src/index.ts", "src/runs/worker-main.ts", "src/egress-authz-main.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Read configuration through loadConfig() (src/config.ts) and pass it down — process.env is parsed exactly once at the boundary.",
        },
        {
          selector: "MemberExpression[object.name='process'][computed=true][property.value='env']",
          message:
            "Read configuration through loadConfig() (src/config.ts) and pass it down — process.env is parsed exactly once at the boundary.",
        },
        {
          selector: "VariableDeclarator[init.name='process'] ObjectPattern Property[key.name='env']",
          message:
            "Read configuration through loadConfig() (src/config.ts) and pass it down — process.env is parsed exactly once at the boundary.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "node:process",
              importNames: ["env"],
              message:
                "Read configuration through loadConfig() (src/config.ts) and pass it down — process.env is parsed exactly once at the boundary.",
            },
            {
              name: "process",
              importNames: ["env"],
              message:
                "Read configuration through loadConfig() (src/config.ts) and pass it down — process.env is parsed exactly once at the boundary.",
            },
          ],
        },
      ],
    },
  },
);
