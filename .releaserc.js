const isStableRelease = process.env.SEMANTIC_RELEASE_STABLE === "true";

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
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: true,
        pkgRoot: "dist",
        distTag: isStableRelease ? "latest" : "beta",
      },
    ],
    ["@semantic-release/github", githubPluginOptions],
  ],
};
