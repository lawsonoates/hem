#!/usr/bin/env bun

import { $ } from 'bun';

const outputPath = '../core/src/database/schema/auth.sql.ts';
const absoluteOutputPath = decodeURIComponent(
	new URL('../../core/src/database/schema/auth.sql.ts', import.meta.url)
		.pathname
);
const configPath = './src/auth/index.ts';
const lintBanner = `/* eslint-disable sort-keys */
/* oxlint-disable no-inline-comments */`;

await $`bun --bun run auth generate --config ${configPath} --output ${outputPath} --yes`;

const schemaFile = Bun.file(absoluteOutputPath);
const schemaContents = await schemaFile.text();

if (!schemaContents.startsWith(lintBanner))
	await Bun.write(schemaFile, `${lintBanner}\n\n${schemaContents}`);

await $`bun x oxfmt --write ${absoluteOutputPath}`;
