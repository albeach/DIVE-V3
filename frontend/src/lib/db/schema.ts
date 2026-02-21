import {
    timestamp,
    pgTable,
    text,
    primaryKey,
    integer,
} from "drizzle-orm/pg-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

export const users = pgTable("user", {
    id: text("id").notNull().primaryKey(),
    name: text("name"),
    email: text("email"),  // Nullable: Remote IdPs may not provide email
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),
});

/** OAuth account type */
export type OAuthAccountType = "oauth" | "oidc" | "email" | "webauthn";

export const accounts = pgTable(
    "account",
    {
        userId: text("userId")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        type: text("type").notNull(),
        provider: text("provider").notNull(),
        providerAccountId: text("providerAccountId").notNull(),
        refresh_token: text("refresh_token"),
        access_token: text("access_token"),
        expires_at: integer("expires_at"),
        token_type: text("token_type"),
        scope: text("scope"),
        id_token: text("id_token"),
        session_state: text("session_state"),
    },
    (account) => ({
        compoundKey: primaryKey({
            columns: [account.provider, account.providerAccountId],
        }),
    })
);

export const sessions = pgTable("session", {
    sessionToken: text("sessionToken").notNull().primaryKey(),
    userId: text("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
    "verificationToken",
    {
        identifier: text("identifier").notNull(),
        token: text("token").notNull(),
        expires: timestamp("expires", { mode: "date" }).notNull(),
    },
    (vt) => ({
        compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
    })
);

// ============================================
// Type Exports for Drizzle Operations
// ============================================

/** User select type */
export type User = InferSelectModel<typeof users>;
/** User insert type */
export type NewUser = InferInsertModel<typeof users>;

/** Account select type */
export type Account = InferSelectModel<typeof accounts>;
/** Account insert type */
export type NewAccount = InferInsertModel<typeof accounts>;
/** Account update type (partial insert) */
export type AccountUpdate = Partial<NewAccount>;

/** Session select type */
export type Session = InferSelectModel<typeof sessions>;
/** Session insert type */
export type NewSession = InferInsertModel<typeof sessions>;

/** Verification token select type */
export type VerificationToken = InferSelectModel<typeof verificationTokens>;
/** Verification token insert type */
export type NewVerificationToken = InferInsertModel<typeof verificationTokens>;
