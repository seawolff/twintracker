import { Pool } from 'pg';

const isRemote =
  !process.env.DATABASE_URL?.includes('localhost') &&
  !process.env.DATABASE_URL?.includes('127.0.0.1') &&
  !process.env.DATABASE_URL?.includes('@db:');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway and other hosted DBs use self-signed certs; skip verification for remote connections.
  ...(isRemote ? { ssl: { rejectUnauthorized: false } } : {}),
});
