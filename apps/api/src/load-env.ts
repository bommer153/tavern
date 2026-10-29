// Imported first by main.ts so decorators that read process.env see .env values.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
