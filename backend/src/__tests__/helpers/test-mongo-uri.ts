/**
 * Centralized MongoDB URI helper for tests.
 * Prefers environment-provided URIs (from globalSetup or CI),
 * then builds a localhost URI if a password is provided, and
 * finally falls back to an unauthenticated localhost URI for dev.
 */
export function getTestMongoUri(): string {
  const fromEnv = process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (fromEnv) return fromEnv;

  if (process.env.MONGO_PASSWORD) {
    return `mongodb://admin:${process.env.MONGO_PASSWORD}@localhost:27017?authSource=admin`;
  }

  return 'mongodb://localhost:27017';
}

export function getTestMongoDatabase(): string {
  return process.env.MONGODB_DATABASE || 'dive-v3-test';
}
