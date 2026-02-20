/**
 * Encrypted Config Storage
 *
 * Stores database credentials in an encrypted file (.agenticmail.enc)
 * using AES-256-GCM with scrypt key derivation from a master secret.
 *
 * Format: JSON { iv, tag, salt, data } (all base64)
 */

import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const CONFIG_FILE = '.agenticmail.enc';
const ALGORITHM = 'aes-256-gcm';
const SCRYPT_KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
}

function getConfigPath(): string {
  return join(process.cwd(), CONFIG_FILE);
}

export interface DatabaseConfigEntry {
  type: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  connectionString?: string;
  ssl?: boolean;
  authToken?: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export async function saveDbConfig(config: DatabaseConfigEntry, secret: string): Promise<void> {
  const salt = randomBytes(16);
  const key = deriveKey(secret, salt);
  const iv = randomBytes(12);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(config);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    salt: salt.toString('base64'),
    data: encrypted.toString('base64'),
  };

  writeFileSync(getConfigPath(), JSON.stringify(payload, null, 2), 'utf-8');
}

export async function loadDbConfig(secret: string): Promise<DatabaseConfigEntry | null> {
  const path = getConfigPath();
  if (!existsSync(path)) return null;

  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const salt = Buffer.from(raw.salt, 'base64');
    const iv = Buffer.from(raw.iv, 'base64');
    const tag = Buffer.from(raw.tag, 'base64');
    const data = Buffer.from(raw.data, 'base64');

    const key = deriveKey(secret, salt);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf-8'));
  } catch {
    return null;
  }
}

export function configFileExists(): boolean {
  return existsSync(getConfigPath());
}
