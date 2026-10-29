// Starts a single-node MongoDB replica set for local development.
// Transactions (wallet, gifts, orders) require a replica set; a standalone mongod rejects them.
// Usage: pnpm db:start             (foreground; env: MONGOD_BIN, MONGO_RS_PORT)
//        mongo-rs.mjs --detach      (used by the API's `dev`: reuse a running set or start one in the background, then exit)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { resolve } from 'node:path';

const port = process.env.MONGO_RS_PORT ?? '27018';
const detach = process.argv.includes('--detach');
// Anchored to the repo root so every caller (root or apps/api) shares one data directory.
const root = resolve(import.meta.dirname, '../..');

if (detach) {
  // Only manage the local set when the API actually points at it (not Atlas or Docker).
  const envFile = resolve(root, 'apps/api/.env');
  const uri = process.env.MONGODB_URI ?? (existsSync(envFile) ? /^MONGODB_URI=(.*)$/m.exec(readFileSync(envFile, 'utf8'))?.[1] : undefined);
  if (uri && !new RegExp(`(127\\.0\\.0\\.1|localhost):${port}\\b`).test(uri)) process.exit(0);
}

const listening = await new Promise((ok) => {
  const s = connect(Number(port), '127.0.0.1');
  s.once('connect', () => (s.destroy(), ok(true)));
  s.once('error', () => ok(false));
});

if (!listening) {
  const candidates = [
    process.env.MONGOD_BIN,
    'C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe',
    '/usr/bin/mongod',
    '/usr/local/bin/mongod',
    '/opt/homebrew/bin/mongod',
  ].filter(Boolean);
  const bin = candidates.find((p) => existsSync(p));
  if (!bin) {
    console.error('mongod not found. Set MONGOD_BIN or use docker compose (infrastructure/docker).');
    // Detached mode must never stop the API from starting; it reports the DB problem itself.
    process.exit(detach ? 0 : 1);
  }
  const dbPath = resolve(root, '.data/mongo-rs');
  mkdirSync(dbPath, { recursive: true });
  const args = ['--replSet', 'rs0', '--port', port, '--bind_ip', '127.0.0.1', '--dbpath', dbPath];
  if (detach) {
    // Outlives this script (and the dev session); logs go to a file instead of a closed terminal.
    spawn(bin, [...args, '--logpath', resolve(root, '.data/mongod.log'), '--logappend'], { detached: true, stdio: 'ignore' }).unref();
  } else {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', (code) => process.exit(code ?? 0));
  }
} else if (!detach) {
  console.log(`MongoDB is already listening on ${port}; ensuring the replica set is initiated.`);
}

// Initiate the replica set once mongod accepts connections (idempotent).
const { MongoClient } = await import('mongodb');
for (let i = 0; i < 30; i++) {
  try {
    const client = await MongoClient.connect(`mongodb://127.0.0.1:${port}/?directConnection=true`);
    try {
      await client.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
      console.log('Replica set initiated.');
    } catch (e) {
      if (e.codeName !== 'AlreadyInitialized') throw e;
    }
    await client.close();
    console.log(`MongoDB replica set ready: mongodb://127.0.0.1:${port}/tavern?replicaSet=rs0`);
    break;
  } catch (e) {
    if (i === 29) throw e;
    await new Promise((r) => setTimeout(r, 1000));
  }
}
if (detach || listening) process.exit(0);
