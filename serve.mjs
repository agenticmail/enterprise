import { createAdapter, createServer } from './dist/index.js';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const db = await createAdapter({ type: 'sqlite', connectionString: './enterprise-live.db' });
await db.migrate();
let user = await db.getUserByEmail('ope@agenticmail.io');
if (!user) {
  user = await db.createUser({ email: 'ope@agenticmail.io', name: 'Ope Olatunji', role: 'owner', password: 'Enterprise2026!' });
  await db.updateSettings({ name: 'AgenticMail', subdomain: 'agenticmail', domain: 'agenticmail.io' });
  await db.createAgent({ name: 'support-bot', email: 'support@agenticmail.io', role: 'customer-support', status: 'active', createdBy: user.id });
  await db.createAgent({ name: 'research-bot', email: 'research@agenticmail.io', role: 'researcher', status: 'active', createdBy: user.id });
  await db.createAgent({ name: 'writer-bot', email: 'writer@agenticmail.io', role: 'content-writer', status: 'active', createdBy: user.id });
  console.log('✅ Seeded: admin + 3 agents');
}

// Persistent JWT secret so tokens survive restarts
const secretFile = './.jwt-secret';
const jwtSecret = existsSync(secretFile)
  ? readFileSync(secretFile, 'utf8').trim()
  : (() => { const s = randomUUID() + randomUUID(); writeFileSync(secretFile, s); return s; })();

const server = createServer({ port: 3200, db, jwtSecret, logging: true });
await server.start();
console.log('\nLogin: ope@agenticmail.io / Enterprise2026!');

process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down...'); process.exit(0); });
setInterval(() => {}, 30000);
