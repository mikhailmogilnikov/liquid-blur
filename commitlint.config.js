/**
 * Conventional commits: `type(scope): subject`. The scope is optional; when given, it's a package,
 * a feature or a part of the repo, so the history reads by package and by feature.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot writes its own ("Bump …", with release notes in the body)
  ignores: [(message) => message.includes("Signed-off-by: dependabot[bot]")],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "core",
        "react",
        "vue",
        "svelte",
        "blur",
        "morph",
        "indicator",
        "drag",
        "lift",
        "layout",
        "motion",
        "docs",
        "repo",
        "ci",
        "deps",
        "release",
      ],
    ],
  },
};
