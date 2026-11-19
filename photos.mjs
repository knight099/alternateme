import { randomUUID } from 'node:crypto';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const limit = 1500000;
const endpoint = () => process.env.NEON_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
const object = id => ({ Bucket: process.env.NEON_STORAGE_BUCKET || 'assets', Key: 'gallery/' + id + '.jpg' });
function storage() {
  return new S3Client({
    endpoint: endpoint(), region: process.env.NEON_STORAGE_REGION || process.env.AWS_REGION || 'us-east-1',
    forcePathStyle: true,
    credentials: process.env.NEON_STORAGE_ACCESS_KEY ? {
      accessKeyId: process.env.NEON_STORAGE_ACCESS_KEY, secretAccessKey: process.env.NEON_STORAGE_SECRET_KEY
    } : undefined
  });
}

// Preserve JPEG coding segments and scan data, discarding embedded previews,
// comments, EXIF GPS information, application data and trailing bytes.
export function cleanJpeg(buf) {
  function invalid() { throw Object.assign(new Error('Choose a valid JPEG under 1.5 MB and 16 megapixels.'), {statusCode:400}); }
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf.length > limit || buf.readUInt16BE(0) !== 0xffd8) invalid();
  let i = 2, frame = false, scan = false;
  const chunks = [buf.subarray(0,2)];
  while (i < buf.length) {
    if (buf[i++] !== 255) invalid();
    while(buf[i] === 255) i++;
    const marker = buf[i++], start = i-2;
    if (marker === 217 && frame && scan) return Buffer.concat([...chunks,buf.subarray(start,i)]);
    if (i+2 > buf.length || marker === 216) invalid();
    const size = buf.readUInt16BE(i), end = i+size;
    if (size < 2 || end > buf.length) invalid();
    if (marker >= 224 && marker <= 239 || marker === 254) { i=end; continue; }
    if (![192,193,194,196,219,221,218].includes(marker)) invalid();
    if ([192,193,194].includes(marker)) {
      if (frame || size < 11) invalid();
      const pixels = buf.readUInt16BE(i+3)*buf.readUInt16BE(i+5);
      if (!pixels || pixels > 16000000) invalid();
      frame=true;
    }
    chunks.push(buf.subarray(start,end));
    i=end;
    if (marker === 218) {
      if (!frame) invalid();
      scan=true;
      const scanStart=i;
      while (i < buf.length) {
        if (buf[i] !== 255) { i++; continue; }
        let next=i+1;
        while(buf[next] === 255) next++;
        if(buf[next] !== 0 && !(buf[next]>=208 && buf[next]<=215)) break;
        i=next+1;
      }
      chunks.push(buf.subarray(scanStart,i));
    }
  }
  invalid();
}

export function registerPhotos(api,{database,fail}) {
  if (!api.hasContentTypeParser('image/jpeg')) api.addContentTypeParser('image/jpeg',{parseAs:'buffer',bodyLimit:limit},(_req,body,done)=>done(null,body));
  async function target(req,edit=false) {
    const {kind,id} = req.params;
    const sql=database();
    if (!['profile','listing'].includes(kind) || id.length>255 ||
        (kind === 'listing' && (!/^\d{1,10}$/.test(id) || Number(id)>2147483647))) fail(404,'Gallery unavailable.');
    const [target] = kind === 'profile'
      ? await sql`SELECT id AS owner, discoverable AS visible FROM alternateme_profiles WHERE id=${id}`
      : await sql`SELECT owner,status='open' AS visible FROM alternateme_listings WHERE id=${Number(id)}`;
    if(!target) fail(404,'Gallery unavailable.');
    if(target.owner !== req.userId) {
      if(edit || !target.visible) fail(404,'Gallery unavailable.');
      const blocked=await sql`SELECT 1 FROM alternateme_pairs WHERE ${target.owner} IN (a,b) AND ${req.userId} IN (a,b) AND (a_block OR b_block)`;
      if(blocked.length) fail(404,'Gallery unavailable.');
    }
    return {sql,profile:kind==='profile'?id:null,listing:kind==='listing'?Number(id):null};
  }
  const route='/photos/:kind/:id';
  const validId = id => typeof id==='string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);
  api.get(route,async req=>{
    const {sql,profile,listing}=await target(req);
    return sql`SELECT id FROM alternateme_photos WHERE profile_id=${profile} OR listing_id=${listing} ORDER BY position,slot`;
  });
  api.get(route+'/:photo',async(req,reply)=>{
    const {sql,profile,listing}=await target(req);
    if(!validId(req.params.photo)) fail(404,'Photo unavailable.');
    const [row]=await sql`SELECT backend,encode(jpeg,'base64') AS data FROM alternateme_photos WHERE id=${req.params.photo} AND (profile_id=${profile} OR listing_id=${listing})`;
    if(!row) fail(404,'Photo unavailable.');
    const bytes=row.backend==='s3'?(await storage().send(new GetObjectCommand(object(req.params.photo)))).Body:Buffer.from(row.data,'base64');
    return reply.type('image/jpeg').header('X-Content-Type-Options','nosniff').header('Cache-Control','private, no-store').send(bytes);
  });
  api.post(route,{bodyLimit:limit},async req=>{
    const {sql,profile,listing}=await target(req,true);
    const bytes=cleanJpeg(req.body);
    const id=randomUUID(), external=Boolean(endpoint());
    const [row]=await sql`WITH current AS (SELECT slot,position FROM alternateme_photos WHERE profile_id=${profile} OR listing_id=${listing})
      INSERT INTO alternateme_photos(id,profile_id,listing_id,slot,position,backend,jpeg)
      SELECT ${id},${profile},${listing},s,coalesce((SELECT max(position)+1 FROM current),0),'database',decode(${bytes.toString('base64')},'base64')
      FROM generate_series(0,5) s WHERE s NOT IN (SELECT slot FROM current) ORDER BY s LIMIT 1 ON CONFLICT DO NOTHING RETURNING id`;
    if(!row) fail(409,'Gallery is full or changed. Refresh and try again.');
    if(external) {
      const client=storage();
      try {
        await client.send(new PutObjectCommand({...object(id),Body:bytes,ContentType:'image/jpeg'}));
      } catch {
        req.log.warn('Gallery upload retained in database because object storage is unavailable.');
        return row;
      }
      const result=await sql`UPDATE alternateme_photos SET backend='s3',jpeg=NULL WHERE id=${id} RETURNING id`;
      if(!result.length) await client.send(new DeleteObjectCommand(object(id)));
    }
    return row;
  });
  api.post(route+'/order',async req=>{
    const {sql,profile,listing}=await target(req,true);
    const ids=req.body?.ids;
    if(!Array.isArray(ids)||ids.length>6||!ids.every(validId)||new Set(ids).size!==ids.length) fail(400,'Check the photo order.');
    const saved=await sql`WITH requested AS (SELECT value::uuid AS id,ordinality AS position FROM jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) WITH ORDINALITY),
      current AS (SELECT id FROM alternateme_photos WHERE profile_id=${profile} OR listing_id=${listing})
      UPDATE alternateme_photos p SET position=r.position-1 FROM requested r WHERE p.id=r.id AND p.id IN (SELECT id FROM current)
      AND (SELECT count(*) FROM current)=${ids.length} AND NOT EXISTS(SELECT id FROM requested EXCEPT SELECT id FROM current) RETURNING p.id`;
    if(saved.length!==ids.length) fail(409,'Gallery changed. Refresh to reorder.');
    return {ok:true};
  });
  api.post(route+'/:photo/remove',async req=>{
    const {sql,profile,listing}=await target(req,true);
    if(!validId(req.params.photo)) fail(404,'Photo unavailable.');
    const [row]=await sql`SELECT backend FROM alternateme_photos WHERE id=${req.params.photo} AND (profile_id=${profile} OR listing_id=${listing})`;
    if(!row) fail(404,'Photo unavailable.');
    if(row.backend==='s3') await storage().send(new DeleteObjectCommand(object(req.params.photo)));
    await sql`DELETE FROM alternateme_photos WHERE id=${req.params.photo} AND (profile_id=${profile} OR listing_id=${listing})`;
    return {ok:true};
  });
}
