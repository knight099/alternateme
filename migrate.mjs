import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

if (process.env.VERCEL_ENV === 'production') {
  const sql = neon(process.env.DATABASE_URL);
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  await sql.transaction(statements.map(statement => sql.query(statement)));
  await sql`SELECT id FROM alternateme_profiles LIMIT 0`;
  await sql`SELECT id FROM alternateme_listings LIMIT 0`;
  console.log('Verified Neon profile and listing tables.');
}
