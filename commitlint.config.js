/**
 * Conventional commits: `type(scope): subject`. The scope is optional; when given, it's a package
 * or a part of the repo, so the history reads by package.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  // Dependabot writes its own ("Bump …", with release notes in the body)
  ignores: [(message) => message.includes("Signed-off-by: dependabot[bot]")],
  rules: {
    "scope-enum": [2, "always", ["core", "blur", "morph", "docs", "repo", "ci", "deps", "release"]],
  },
};
