module.exports = {
    root: true,
    env: { browser: true, es2021: true },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react/jsx-runtime',
        'plugin:react-hooks/recommended',
    ],
    ignorePatterns: ['dist', 'public'],
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    settings: { react: { version: 'detect' } },
    plugins: ['react-refresh'],
    rules: {
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        'react/prop-types': 'off',
        'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
    overrides: [
        {
            files: ['src/utils/piperWorker.js'],
            env: { worker: true, browser: false },
        },
    ],
};
