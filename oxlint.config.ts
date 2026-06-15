import { defineConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import react from 'ultracite/oxlint/react';
import tanstack from 'ultracite/oxlint/tanstack';

export default defineConfig({
	extends: [core, react, tanstack],
	ignorePatterns: core.ignorePatterns,
	overrides: [
		{
			files: ['*.tsx'],
			rules: {
				'react/display-name': 'error',
				'react/rules-of-hooks': 'error',
			},
		},
		{
			files: ['*.ts'],
			rules: {
				complexity: 'error',
			},
		},
		{
			files: ['packages/web/**/*.{ts,tsx}'],
			rules: {
				'nextjs/no-head-element': 'off',
				'nextjs/no-img-element': 'off',
			},
		},
	],
	rules: {
		complexity: 'off',
		curly: ['error', 'multi-or-nest', 'consistent'],
		'func-names': [
			'error',
			'always',
			{
				generators: 'never',
			},
		],
		'func-style': 'off',
		'import/no-relative-parent-imports': 'off',
		'max-classes-per-file': 'off',
		'max-statements': 'off',
		'no-inner-declarations': 'off',
		'no-warning-comments': 'warn',
		'promise/prefer-await-to-callbacks': 'off',
		'promise/prefer-await-to-then': 'off',
		'react-perf/jsx-no-new-function-as-prop': 'off',
		'react/display-name': 'off',
		'react/rules-of-hooks': 'off',
		'typescript/no-namespace': 'off',
		'typescript/no-non-null-assertion': 'warn',
		'unicorn/catch-error-name': 'off',
	},
});
