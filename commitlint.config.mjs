export default {
  parserPreset: 'conventional-changelog-conventionalcommits',
  defaultIgnores: false,
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'doc', 'chore']],
    'type-empty': [2, 'never'],
    'subject-empty': [2, 'never'],
  },
};
