const isStableRelease = process.env.SEMANTIC_RELEASE_STABLE === "true";

const branches = isStableRelease ? ["master"] : [{ name: "master", channel: "beta", prerelease: "beta" }];
const githubPluginOptions = isStableRelease
  ? {}
  : {
      successComment: false,
      failComment: false,
      releasedLabels: false,
    };

/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
  branches,
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
      },
    ],
    ["@semantic-release/github", githubPluginOptions],
  ],
};
