import os from 'node:os';
import path from 'node:path';

const app = 'hem';

const home = process.env.HEM_TEST_HOME ?? os.homedir();

export const Path = {
	auth: path.join(home, '.local', 'share', app, 'auth.json'),
	config: path.join(home, '.config', app),
	data: path.join(home, '.local', 'share', app),
};
