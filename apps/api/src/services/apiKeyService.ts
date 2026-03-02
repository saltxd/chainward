import { randomBytes, createHash } from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { apiKeys } from '@chainward/db';
import type { Database } from '@chainward/db';
import { AppError } from '../middleware/errorHandler.js';

const KEY_PREFIX = 'ag_';
const KEY_HEX_LENGTH = 40;

export interface CreateApiKeyInput {
  name: string;
  scopes?: string[];
  expiresAt?: string; // ISO date string
}

export interface ApiKeyResponse {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyWithRawKey extends ApiKeyResponse {
  rawKey: string;
}

export class ApiKeyService {
  constructor(private db: Database) {}

  /** Generate a new API key. Returns the raw key (shown only once). */
  async create(userId: string, input: CreateApiKeyInput): Promise<ApiKeyWithRawKey> {
    const scopes = input.scopes ?? ['read'];
    const validScopes = ['read', 'write', 'admin'];
    for (const scope of scopes) {
      if (!validScopes.includes(scope)) {
        throw new AppError(400, 'INVALID_SCOPE', `Invalid scope: ${scope}`);
      }
    }

    // Generate raw key: ag_ + 40 hex chars
    const rawKey = KEY_PREFIX + randomBytes(KEY_HEX_LENGTH / 2).toString('hex');
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 8); // ag_xxxxxxxx

    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    const [created] = await this.db
      .insert(apiKeys)
      .values({
        userId,
        name: input.name,
        keyHash,
        keyPrefix,
        scopes,
        expiresAt,
      })
      .returning();

    if (!created) {
      throw new AppError(500, 'CREATE_FAILED', 'Failed to create API key');
    }

    return {
      id: created.id,
      name: created.name,
      keyPrefix: created.keyPrefix,
      scopes: created.scopes,
      lastUsedAt: created.lastUsedAt,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      rawKey,
    };
  }

  /** List all API keys for a user (without the raw key). */
  async list(userId: string): Promise<ApiKeyResponse[]> {
    const keys = await this.db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, userId))
      .orderBy(desc(apiKeys.createdAt));

    return keys;
  }

  /** Revoke (delete) an API key. */
  async revoke(userId: string, id: number): Promise<void> {
    const [existing] = await this.db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new AppError(404, 'KEY_NOT_FOUND', 'API key not found');
    }

    await this.db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)));
  }

  /** Validate an API key and return the associated user info. Returns null if invalid. */
  async validate(rawKey: string): Promise<{ userId: string; scopes: string[] } | null> {
    if (!rawKey.startsWith(KEY_PREFIX)) return null;

    const keyHash = hashKey(rawKey);

    const [key] = await this.db
      .select({
        id: apiKeys.id,
        userId: apiKeys.userId,
        scopes: apiKeys.scopes,
        expiresAt: apiKeys.expiresAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!key) return null;

    // Check expiration
    if (key.expiresAt && key.expiresAt < new Date()) return null;

    // Update last used timestamp (fire and forget)
    this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .then(() => {})
      .catch(() => {});

    return { userId: key.userId, scopes: key.scopes };
  }
}

/** Hash a raw API key with SHA-256 */
function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}
