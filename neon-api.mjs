import Fastify from 'fastify';
import { neon } from '@neondatabase/serverless';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { functionBaseUrl } from '@neon/env';

import {registerRecoveryRoutes} from './recovery.mjs';
import {registerSocial} from './social.mjs';
import {registerListings} from './listings.mjs';
import {registerPeople} from './people.mjs';
import {registerPhotos} from './photos.mjs';
import {PROMPTS} from './people-fields.mjs';
const fail = (statusCode,message) => { throw Object.assign(new Error(message),{statusCode}); };
function field(body,key,max,required=true) {
  const value=body?.[key];
  if(typeof value !== 'string' || value.length>max || (required && !value.trim())) fail(400,'Check '+key+'.');
  return value.trim();
}
function productionDatabase() {
  if (!process.env.DATABASE_URL) fail(503,'Neon database setup is pending.');
  return neon(process.env.DATABASE_URL);
}
async function auth(path,req,body) {
  if (!process.env.NEON_AUTH_BASE_URL) fail(503,'Neon authentication setup is pending.');
  const url=new URL(process.env.NEON_AUTH_BASE_URL.replace(/\/$/,'')+'/'+path);
  const headers={'Content-Type':'application/json', Origin:url.origin};
  // Forward only the provider cookies copied into our own HttpOnly namespace.
  headers.Cookie=(req.headers.cookie || '').split(/;\s*/).filter(v=>v.startsWith('altneon_')).map(v=>v.slice(8)).join('; ');
  return fetch(url,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(10000)});
}
function cookies(upstream,reply) {
  const values=upstream.headers.getSetCookie().map(cookie=>{
    const [pair,...attrs]=cookie.split(';');
    return ['altneon_'+pair,...attrs.filter(a=>!/^\s*(domain|path|samesite|secure|httponly)(=|$)/i.test(a.trim())), 'Path=/','HttpOnly','Secure','SameSite=Lax'].join('; ');
  });
  if(values.length) reply.header('Set-Cookie',values);
}
function neonAuthRoutes(cloud) {
registerRecoveryRoutes(cloud,{auth,fail,field,cookies});
for(const [route,endpoint] of [['register','sign-up/email'],['login','sign-in/email'],['logout','sign-out']]) {
  cloud.post('/api/'+route,async(req,reply)=>{
    let data={};
    if(route!=='logout') {
      const email=field(req.body,'email',254);
      const password=req.body.password;
      if(typeof password!=='string'||password.length<8||password.length>256) fail(400,'Check password length.');
      data={email,password};
      if(route==='register') data.name=field(req.body,'name',80);
    }
    const result=await auth(endpoint,req,data);
    if(!result.ok) {
      const error=await result.json().catch(()=>({}));
      if(error.code==='EMAIL_NOT_VERIFIED') return {verificationRequired:true};
      if(result.status===429) fail(429,'Too many attempts. Please try again later.');
      fail(result.status<500?result.status:502,route==='login'?'Check your email and password.':'Could not complete the account request.');
    }
    cookies(result,reply);
    return {ok:true};
  });
}
}
async function neonIdentity(req) {
  if(!(req.headers.cookie||'').includes('altneon_')) return null;
  const response=await auth('get-session',req);
  if(response.status===401) return null;
  if(!response.ok) fail(502,'Session service unavailable.');
  const session=await response.json();
  return session?.user?.id && session.session && session.user.emailVerified === true ? session.user : null;
}
export function createCloud({database=productionDatabase,identity=neonIdentity,authRoutes=neonAuthRoutes,deleteIdentity}={}) {
const cloud=Fastify({bodyLimit:32000});
cloud.setErrorHandler((err,req,reply)=>{
  const code=err.statusCode || 502;
  reply.code(code).send({error:code>=500 && code!==503?'Service temporarily unavailable.':err.message});
});
cloud.addHook('onRequest',async (req,reply)=>{
  reply.header('Cache-Control','no-store');
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin) {
    let originHost;
    try {originHost=new URL(req.headers.origin).host;} catch {fail(403,'Invalid origin.');}
    if(originHost!==req.headers.host) fail(403,'Invalid origin.');
  }
});
authRoutes(cloud);
cloud.get('/api/me',async(req,reply)=>{
  const user=await identity(req);
  if(!user) return reply.type('application/json').send('null');
  const sql=database();
  await sql`INSERT INTO alternateme_profiles(id,name) VALUES(${user.id},${user.name || 'Member'}) ON CONFLICT DO NOTHING`;
  const [profile]=await sql`SELECT * FROM alternateme_profiles WHERE id=${user.id}`;
  return {...profile,cloudProfile:true};
});
cloud.register(async api=>{
  api.decorateRequest('userId',null);
  api.addHook('preHandler',async req=>{
    const user=await identity(req);
    if(!user) fail(401,'Sign in first.');
    req.userId=user.id;
  });
  api.get('/flats',async req=>database()`SELECT l.id,l.owner,l.title,l.area,l.rent,l.currency,l.kind,p.name FROM alternateme_listings l JOIN alternateme_profiles p ON p.id=l.owner WHERE l.status='open' AND NOT EXISTS (SELECT 1 FROM alternateme_pairs pair WHERE l.owner<>${req.userId} AND l.owner IN(pair.a,pair.b) AND ${req.userId} IN(pair.a,pair.b) AND (pair.a_block OR pair.b_block)) ORDER BY l.id DESC`);
  api.get('/flatmates',async req=>database()`SELECT p.id,p.name,CASE WHEN p.show_hometown THEN p.hometown ELSE '' END AS hometown,p.hobbies,p.about FROM alternateme_profiles p WHERE p.discoverable AND p.id<>${req.userId} AND NOT EXISTS (SELECT 1 FROM alternateme_pairs pair WHERE p.id IN(pair.a,pair.b) AND ${req.userId} IN(pair.a,pair.b) AND (pair.a_block OR pair.b_block)) ORDER BY p.name`);
  api.post('/mode',async req=>{
    if(!['search','post'].includes(req.body?.mode)) fail(400,'Choose Search or Post.');
    await database()`UPDATE alternateme_profiles SET mode=${req.body.mode} WHERE id=${req.userId}`;
    return {ok:true};
  });
  api.post('/profile',async req=>{
    const b=req.body;
    await database()`UPDATE alternateme_profiles SET name=${field(b,'name',80)},about=${field(b,'about',600,false)},hometown=${field(b,'hometown',100,false)},hobbies=${field(b,'hobbies',200,false)},discoverable=${b.discoverable===true} WHERE id=${req.userId}`;
    return {ok:true};
  });
  api.post('/flats',async req=>{
    const b=req.body;
    const rent=Number(b?.rent);
    if(!Number.isSafeInteger(rent)||rent<=0||!['Whole flat','Private room','Shared room'].includes(b.kind)||! /^[A-Z]{3}$/.test(b.currency)) fail(400,'Check the listing terms.');
    await database()`INSERT INTO alternateme_listings(owner,title,area,rent,currency,kind) VALUES(${req.userId},${field(b,'title',100)},${field(b,'area',100)},${rent},${b.currency},${b.kind})`;
    return {ok:true};
  });
  const endpoint=()=>process.env.NEON_STORAGE_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3;
  const storage=()=>new S3Client({
    endpoint:endpoint(),region:process.env.NEON_STORAGE_REGION || process.env.AWS_REGION,
    forcePathStyle:true,
    credentials:process.env.NEON_STORAGE_ACCESS_KEY ? {
      accessKeyId:process.env.NEON_STORAGE_ACCESS_KEY,secretAccessKey:process.env.NEON_STORAGE_SECRET_KEY
    } : undefined
  });
  api.addContentTypeParser('image/jpeg',{parseAs:'buffer',bodyLimit:2000000},(_req,buf,done)=>done(null,buf));
  api.post('/portrait',{bodyLimit:2000000},async req=>{
    const file=req.body;
    if(!Buffer.isBuffer(file)||file.length<4||file.readUInt16BE(0)!==0xffd8||file.readUInt16BE(file.length-2)!==0xffd9) fail(400,'Choose a JPEG photo.');
    if(!endpoint()) fail(503,'Object storage setup is pending.');
    await storage().send(new PutObjectCommand({Bucket:'assets',Key:'portraits/'+req.userId,Body:file,ContentType:'image/jpeg'}));
    return {ok:true};
  });
  api.get('/portrait',async(req,reply)=>{
    if(!endpoint()) fail(503,'Object storage setup is pending.');
    try {
      const image=await storage().send(new GetObjectCommand({Bucket:'assets',Key:'portraits/'+req.userId}));
      return reply.type('image/jpeg').header('X-Content-Type-Options','nosniff').send(image.Body);
    } catch(e) {if(e.$metadata?.httpStatusCode===404) fail(404,'No portrait yet.');throw e;}
  });
  registerPeople(api,{database,fail});
  registerListings(api,{database,fail});
  registerSocial(api,{database,fail});
  registerPhotos(api,{database,fail});
  api.post('/account/delete',async(req,reply)=>{
    const {password,confirmation}=req.body || {};
    if(confirmation!=='DELETE' || typeof password!=='string' || !password || password.length>256) fail(400,'Enter your password and type DELETE.');
    const sql=database();
    if(!deleteIdentity){
      const check=await auth('verify-password',req,{password});
      if(!check.ok) fail(403,'Could not verify your password.');
    }
    // Remove private objects before removing their ownership records so a retry can finish.
    const photos=await sql`SELECT id FROM alternateme_photos WHERE backend='s3' AND (profile_id=${req.userId} OR listing_id IN (SELECT id FROM alternateme_listings WHERE owner=${req.userId}))`;
    if(photos.length) {
      const client=storage();
      for(const photo of photos) await client.send(new DeleteObjectCommand({Bucket:process.env.NEON_STORAGE_BUCKET||'assets',Key:'gallery/'+photo.id+'.jpg'}));
    }
    if(deleteIdentity) await deleteIdentity(req);
    await sql.transaction([
      sql`DELETE FROM alternateme_listings WHERE owner=${req.userId}`,
      sql`DELETE FROM alternateme_profiles WHERE id=${req.userId}`
    ]);
    if(deleteIdentity) return {deleted:true};
    const provider=await auth('delete-user',req,{password});
    if(!provider.ok) return {dataDeleted:true,message:'Your housing data was deleted. Neon could not close the sign-in account.'};
    const result=await provider.json();
    cookies(provider,reply);
    return result.message==='Verification email sent' ? {dataDeleted:true,message:'Housing data deleted. Confirm the email from Neon to close your account.'} : {deleted:true};
  });
  api.get('/profile-prompts',async()=>{
    if(!process.env.NEON_FUNCTION_HOST_SUFFIX) return {prompts:PROMPTS};
    const result=await fetch(functionBaseUrl('profileprompts'),{signal:AbortSignal.timeout(5000)});
    if(!result.ok) fail(502,'Profile prompts unavailable.');
    return result.json();
  });
},{prefix:'/api'});

return cloud;
}
export const cloud=createCloud();
