import {readFile} from 'node:fs/promises';
export const schemaFiles = ['schema.sql','people.sql','listings.sql','social.sql','photos.sql'];
export async function schemaStatements() {
  const schemas = await Promise.all(schemaFiles.map(file => readFile(new URL(file,import.meta.url),'utf8')));
  return schemas.flatMap(schema => schema.split(';').map(s=>s.trim()).filter(Boolean));
}
