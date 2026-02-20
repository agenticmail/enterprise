import { createAdapter, createServer } from './dist/index.js';
import { randomUUID } from 'crypto';

const db = await createAdapter({ type: 'sqlite', connectionString: './enterprise-live-test.db' });
await db.migrate();
console.log('✅ DB migrated');

// Check if admin already exists
let user = await db.getUserByEmail('ope@agenticmail.io');
if (!user) {
  user = await db.createUser({
    email: 'ope@agenticmail.io',
    name: 'Ope Olatunji',
    role: 'owner',
    password: 'Enterprise2026!',
  });
  console.log('✅ Admin created:', user.id);
} else {
  console.log('✅ Admin exists:', user.id);
}

await db.updateSettings({ name: 'AgenticMail', subdomain: 'agenticmail', domain: 'agenticmail.io' });
console.log('✅ Company: AgenticMail / agenticmail.io');

// Check if API key already exists before creating a new one
const existingKeys = await db.listApiKeys({ createdBy: user.id });
let keyPlaintext;
if (existingKeys.length > 0) {
  console.log('✅ API Key exists:', existingKeys[0].name, '(prefix:', existingKeys[0].keyPrefix + '...)');
  keyPlaintext = '(existing key — plaintext only shown on creation)';
} else {
  const key = await db.createApiKey({ name: 'live-key', createdBy: user.id, scopes: ['read', 'write', 'admin'] });
  keyPlaintext = key.plaintext;
  console.log('✅ API Key:', keyPlaintext);
}

const jwtSecret = randomUUID() + randomUUID();
const server = createServer({ port: 3200, db, jwtSecret, corsOrigins: ['*'], rateLimit: 200 });
await server.start();

console.log('');
console.log('Login: ope@agenticmail.io / Enterprise2026!');
console.log('Key:  ', keyPlaintext);

// Keep process alive
process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nShutting down...'); process.exit(0); });
setInterval(() => {}, 60000);
