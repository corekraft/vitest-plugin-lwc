const isStableRelease = process.env.SEMANTIC_RELEASE_STABLE === "true";
const conventionalCommitTypes = [
  { type: "feat", section: "Features" },
  { type: "fix", section: "Bug Fixes" },
  { type: "perf", section: "Performance" },
  { type: "revert", section: "Reverts" },
  { type: "docs", section: "Documentation" },
  { type: "style", section: "Styles" },
  { type: "refactor", section: "Refactoring" },
  { type: "test", section: "Tests" },
  { type: "build", section: "Build System" },
  { type: "ci", section: "Continuous Integration" },
  { type: "chore", section: "Chores" },
];
const releaseRules = conventionalCommitTypes.map(({ type }) => ({ type, release: "patch" }));
const noteTypes = conventionalCommitTypes.map(({ type, section }) => ({
  type,
  section,
  hidden: false,
}));

const githubPluginOptions = isStableRelease
  ? {}
  : {
      releasedLabels: [],
    };

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches: ["master"],
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
        releaseRules,
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
        presetConfig: {
          types: noteTypes,
        },
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: false,
        pkgRoot: "dist",
        distTag: isStableRelease ? "latest" : "beta",
      },
    ],
    [
      "@semantic-release/exec",
      {
        publishCmd:
          'if [ "$SEMANTIC_RELEASE_STABLE" = "true" ]; then npm publish ./dist --provenance --access public --tag latest; else npm publish ./dist --provenance --access public --tag beta; fi',
      },
    ],
    ["@semantic-release/github", githubPluginOptions],
  ],
};
