import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL as string;

console.log('[DIVE DB] Connecting to database:', connectionString.replace(/password@/, '***@'));

const client = postgres(connectionString, {
    debug: process.env.NODE_ENV === 'development' ? (connection, query, params) => {
        console.log('[DIVE DB Query]', { query: query.substring(0, 200), params });
    } : undefined,
    max: 10,  // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
});

export const db = drizzle(client, { schema });

