import './load-env.js';
import 'reflect-metadata';
import { createApp, logStartup } from './app.js';
import { loadEnv } from './config.js';

const env = loadEnv();
const app = await createApp(env);
await app.listen(env.PORT);
logStartup(env);
