import {neon} from '@neondatabase/serverless';
import {schemaStatements} from './migrations.mjs';
if (process.env.VERCEL_ENV === 'production' || process.argv.includes('--apply')) {
  const sql=neon(process.env.DATABASE_URL);
  const statements=await schemaStatements();
  await sql.transaction(statements.map(s=>sql.query(s)));
  await sql`SELECT p.id FROM alternateme_profiles p, alternateme_listings l, alternateme_threads t, alternateme_photos f LIMIT 0`;
  console.log('Verified housing, matching, messaging and photo tables.');
}
