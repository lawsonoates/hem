import { defineConfig } from 'oxfmt';
import ultracite from 'ultracite/oxfmt';

export default defineConfig({
	...ultracite,
	arrowParens: 'always',
	bracketSameLine: false,
	bracketSpacing: true,
	endOfLine: 'lf',
	ignorePatterns: ['dist/**', 'node_modules/**', '.agents/**'],
	jsxSingleQuote: false,
	printWidth: 80,
	quoteProps: 'as-needed',
	semi: true,
	singleQuote: true,
	sortImports: {
		ignoreCase: true,
		newlinesBetween: true,
		order: 'asc',
	},
	sortPackageJson: true,
	tabWidth: 4,
	trailingComma: 'es5',
	useTabs: true,
});
