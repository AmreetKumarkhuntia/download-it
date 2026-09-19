export default {
  branches: ['master'],
  repositoryUrl: 'https://github.com/AmreetKumarkhuntia/download-it.git',
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    './tooling/release/workspace.mjs',
    [
      '@semantic-release/git',
      {
        assets: [
          'Cargo.toml',
          'Cargo.lock',
          'apps/desktop/package.json',
          'apps/browser-extension/package.json',
          'packages/contracts/package.json',
          'apps/desktop/src-tauri/tauri.conf.json',
        ],
        message: 'chore(release): ${nextRelease.version} [skip ci]',
      },
    ],
    // Build from the release commit so installers, source archives, and tags agree.
    './tooling/release/desktop.mjs',
    [
      '@semantic-release/github',
      {
        // Packaging adapters stage only public deliverables here, whatever their format.
        assets: ['release/assets/*'],
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
};
