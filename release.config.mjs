export default {
  branches: ['master'],
  repositoryUrl: 'https://github.com/AmreetKumarkhuntia/download-it.git',
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    './tooling/release/desktop.mjs',
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'release/assets/*-setup.exe', label: 'Windows x64 installer (unsigned)' },
          {
            path: 'release/assets/*.zip',
            label: 'Windows installer, corresponding sources, and notices',
          },
          { path: 'release/assets/SHA256SUMS.txt', label: 'SHA-256 checksums' },
        ],
        successComment: false,
        failComment: false,
        releasedLabels: false,
      },
    ],
  ],
};
