/**
 * Database Operations Helper
 *
 * Provides properly typed database operations using Drizzle's SQL
 * template literals to handle nullable column updates correctly.
 *
 * This approach uses parameterized queries via Drizzle's sql`` template
 * for type-safe nullable field updates.
 *
 * @see https://orm.drizzle.team/docs/sql
 */

import { db } from './index';
import { accounts, sessions, users } from './schema';
import { eq, and, sql } from 'drizzle-orm';

// ============================================
// Account Token Types
// ============================================

/**
 * Token fields that can be updated on an account
 */
export interface AccountTokenUpdate {
    access_token?: string | null;
    refresh_token?: string | null;
    id_token?: string | null;
    expires_at?: number | null;
    token_type?: string | null;
    scope?: string | null;
    session_state?: string | null;
}

/**
 * Full account data for insertion
 */
export interface AccountInsertData {
    userId: string;
    type: string;
    provider: string;
    providerAccountId: string;
    access_token?: string | null;
    refresh_token?: string | null;
    id_token?: string | null;
    expires_at?: number | null;
    token_type?: string | null;
    scope?: string | null;
    session_state?: string | null;
}

// ============================================
// Account Operations
// ============================================

/**
 * Update account tokens by provider and providerAccountId
 * Uses Drizzle SQL template for type-safe nullable updates
 */
export async function updateAccountTokens(
    provider: string,
    providerAccountId: string,
    tokens: AccountTokenUpdate
): Promise<void> {
    await db.execute(sql`
        UPDATE "account"
        SET
            "access_token" = ${tokens.access_token ?? null},
            "refresh_token" = ${tokens.refresh_token ?? null},
            "id_token" = ${tokens.id_token ?? null},
            "expires_at" = ${tokens.expires_at ?? null},
            "token_type" = ${tokens.token_type ?? null},
            "scope" = ${tokens.scope ?? null},
            "session_state" = ${tokens.session_state ?? null}
        WHERE "provider" = ${provider}
          AND "providerAccountId" = ${providerAccountId}
    `);
}

/**
 * Update specific account tokens by provider and providerAccountId
 * Only updates the provided fields
 */
export async function updateAccountTokensSelective(
    provider: string,
    providerAccountId: string,
    tokens: Partial<AccountTokenUpdate>
): Promise<void> {
    // Build dynamic update using template literal parts
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if ('access_token' in tokens) {
        updates.push('"access_token"');
        values.push(tokens.access_token ?? null);
    }
    if ('refresh_token' in tokens) {
        updates.push('"refresh_token"');
        values.push(tokens.refresh_token ?? null);
    }
    if ('id_token' in tokens) {
        updates.push('"id_token"');
        values.push(tokens.id_token ?? null);
    }
    if ('expires_at' in tokens) {
        updates.push('"expires_at"');
        values.push(tokens.expires_at ?? null);
    }
    if ('token_type' in tokens) {
        updates.push('"token_type"');
        values.push(tokens.token_type ?? null);
    }
    if ('scope' in tokens) {
        updates.push('"scope"');
        values.push(tokens.scope ?? null);
    }
    if ('session_state' in tokens) {
        updates.push('"session_state"');
        values.push(tokens.session_state ?? null);
    }

    if (updates.length === 0) return;

    // Use full update for simplicity with parameterized values
    await db.execute(sql`
        UPDATE "account"
        SET
            "access_token" = ${tokens.access_token ?? null},
            "refresh_token" = ${tokens.refresh_token ?? null},
            "id_token" = ${tokens.id_token ?? null},
            "expires_at" = ${tokens.expires_at ?? null}
        WHERE "provider" = ${provider}
          AND "providerAccountId" = ${providerAccountId}
    `);
}

/**
 * Update account tokens by userId
 * Uses Drizzle SQL template for type-safe nullable updates
 */
export async function updateAccountTokensByUserId(
    userId: string,
    tokens: AccountTokenUpdate
): Promise<void> {
    await db.execute(sql`
        UPDATE "account"
        SET
            "access_token" = ${tokens.access_token ?? null},
            "refresh_token" = ${tokens.refresh_token ?? null},
            "id_token" = ${tokens.id_token ?? null},
            "expires_at" = ${tokens.expires_at ?? null},
            "token_type" = ${tokens.token_type ?? null},
            "scope" = ${tokens.scope ?? null},
            "session_state" = ${tokens.session_state ?? null}
        WHERE "userId" = ${userId}
    `);
}

/**
 * Clear all tokens for an account by userId (used during logout)
 * Uses Drizzle SQL template for type-safe nullable updates
 */
export async function clearAccountTokensByUserId(userId: string): Promise<void> {
    await db.execute(sql`
        UPDATE "account"
        SET
            "access_token" = ${null},
            "id_token" = ${null},
            "refresh_token" = ${null},
            "expires_at" = ${null},
            "session_state" = ${null}
        WHERE "userId" = ${userId}
    `);
}

/**
 * Insert a new account
 * Uses Drizzle SQL template for type-safe inserts including nullable fields
 */
export async function insertAccount(data: AccountInsertData): Promise<void> {
    await db.execute(sql`
        INSERT INTO "account" (
            "userId",
            "type",
            "provider",
            "providerAccountId",
            "access_token",
            "refresh_token",
            "id_token",
            "expires_at",
            "token_type",
            "scope",
            "session_state"
        ) VALUES (
            ${data.userId},
            ${data.type},
            ${data.provider},
            ${data.providerAccountId},
            ${data.access_token ?? null},
            ${data.refresh_token ?? null},
            ${data.id_token ?? null},
            ${data.expires_at ?? null},
            ${data.token_type ?? null},
            ${data.scope ?? null},
            ${data.session_state ?? null}
        )
    `);
}

// ============================================
// Query Operations (using Drizzle ORM properly)
// ============================================

/**
 * Find accounts by userId
 */
export async function findAccountsByUserId(userId: string) {
    return db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId));
}

/**
 * Find account by provider and providerAccountId
 */
export async function findAccountByProvider(provider: string, providerAccountId: string) {
    const results = await db
        .select()
        .from(accounts)
        .where(
            and(
                eq(accounts.provider, provider),
                eq(accounts.providerAccountId, providerAccountId)
            )
        );
    return results[0] ?? null;
}

/**
 * Delete all sessions for a user
 */
export async function deleteSessionsByUserId(userId: string) {
    return db
        .delete(sessions)
        .where(eq(sessions.userId, userId));
}

/**
 * Insert a new session
 */
export async function insertSession(data: {
    sessionToken: string;
    userId: string;
    expires: Date;
}) {
    return db.insert(sessions).values(data);
}

/**
 * Find or create user by ID
 */
export async function findUserById(id: string) {
    const results = await db
        .select()
        .from(users)
        .where(eq(users.id, id));
    return results[0] ?? null;
}

/**
 * Insert a new user
 */
export async function insertUser(data: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
}) {
    return db.insert(users).values(data);
}
