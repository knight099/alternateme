import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const derive = promisify(scrypt);
const db = new DatabaseSync(process.env.DB_PATH || 'alternateme.sqlite');
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY,email TEXT UNIQUE,name TEXT,salt TEXT,hash TEXT,mode TEXT DEFAULT 'search',about TEXT DEFAULT '',hometown TEXT DEFAULT '',hobbies TEXT DEFAULT '',discoverable INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account INTEGER REFERENCES accounts,expires INTEGER);
CREATE TABLE IF NOT EXISTS listings(id INTEGER PRIMARY KEY,owner INTEGER REFERENCES accounts,title TEXT,area TEXT,rent INTEGER,currency TEXT,kind TEXT);`);
const profile = 'id,name,mode,about,hometown,hobbies,discoverable';
function fail(status, message) { throw Object.assign(new Error(message), {statusCode:status}); }
function field(data, key, max, optional=false) {
  const value = data[key];
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(400,'Check '+key+'.');
  return value.trim();
}
export const app = Fastify({bodyLimit:16000});
app.setErrorHandler((error,req,reply) => {
  const status = error.statusCode || 500;
  if (status >= 500) req.log.error(error);
  reply.code(status).send({error: status >= 500 ? 'Request failed.' : error.message});
});
for (const [path,file,type] of [
  ['/','index.html','text/html'], ['/bundle.js','bundle.js','text/javascript'], ['/style.css','style.css','text/css']
]) {
  app.get(path,async (_req,reply) => reply.type(type).send(await readFile(new URL('./public/'+file,import.meta.url))));
}
app.register(async api => {
  api.decorateRequest('account',null);
  api.addHook('preHandler',async (req,reply) => {
    reply.header('Cache-Control','no-store');
    if (req.method === 'POST' && (req.headers['content-type']?.split(';')[0] !== 'application/json' || !req.body || typeof req.body !== 'object' || Array.isArray(req.body))) fail(415,'Send a JSON object.');
    const token = /(?:^|; )session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
    const session = db.prepare('SELECT account FROM sessions WHERE token=? AND expires>?').get(token,Date.now());
    req.account = session?.account;
    req.sessionToken = token;
    if (!req.account && !['/api/me','/api/login','/api/register'].includes(req.routeOptions.url)) fail(401,'Sign in first.');
  });
  api.get('/me',async (req,reply) => req.account ? db.prepare('SELECT '+profile+' FROM accounts WHERE id=?').get(req.account) : reply.type('application/json').send('null'));
  api.get('/flats',async () => db.prepare('SELECT listings.*,name FROM listings JOIN accounts ON accounts.id=owner ORDER BY listings.id DESC').all());
  api.get('/flatmates',async req => db.prepare('SELECT id,name,about,hometown,hobbies FROM accounts WHERE discoverable=1 AND id<>? ORDER BY name').all(req.account));
  async function authenticate(req,reply) {
    const data = req.body;
    const email = field(data,'email',254).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) fail(400,'Enter a valid email.');
    const password = data.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) fail(400,'Use a password of 8–256 characters.');
    let account;
    if (req.routeOptions.url === '/api/register') {
      const name = field(data,'name',80);
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(password,salt,64);
      const inserted = db.prepare('INSERT INTO accounts(email,name,salt,hash) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING').run(email,name,salt,hash.toString('hex'));
      if (!inserted.changes) fail(409,'Email already registered.');
      account = inserted.lastInsertRowid;
    } else {
      const row = db.prepare('SELECT id,salt,hash FROM accounts WHERE email=?').get(email);
      const hash = await derive(password,row?.salt || email,64);
      if (!row || !timingSafeEqual(hash,Buffer.from(row.hash,'hex'))) fail(401,'Check your email and password.');
      account = row.id;
    }
    const key = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(key,account,Date.now()+604800000);
    reply.header('Set-Cookie','session='+key+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800'+(process.env.COOKIE_SECURE==='1'?'; Secure':''));
    return {ok:true};
  }
  api.post('/register',authenticate);
  api.post('/login',authenticate);
  api.post('/logout',async (req,reply) => {
    db.prepare('DELETE FROM sessions WHERE token=?').run(req.sessionToken);
    reply.header('Set-Cookie','session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    return {ok:true};
  });
  api.post('/mode',async req => {
    const data = req.body;
    const id = req.account;
    if (!['search','post'].includes(data.mode)) fail(400,'Choose Search or Post.');
    db.prepare('UPDATE accounts SET mode=? WHERE id=?').run(data.mode,id);
    return {ok:true};
  });
  api.post('/profile',async req => {
    const data = req.body;
    const id = req.account;
    db.prepare('UPDATE accounts SET name=?,about=?,hometown=?,hobbies=?,discoverable=? WHERE id=?').run(field(data,'name',80),field(data,'about',600,true),field(data,'hometown',100,true),field(data,'hobbies',200,true),data.discoverable===true?1:0,id);
    return {ok:true};
  });
  api.post('/flats',async req => {
    const data = req.body;
    const id = req.account;
    const rent = Number(data.rent);
    if (!Number.isSafeInteger(rent) || rent<=0 || !['Whole flat','Private room','Shared room'].includes(data.kind) || !/^[A-Z]{3}$/.test(data.currency)) fail(400,'Check rent, currency and offer type.');
    db.prepare('INSERT INTO listings(owner,title,area,rent,currency,kind) VALUES(?,?,?,?,?,?)').run(id,field(data,'title',100),field(data,'area',100),rent,data.currency,data.kind);
    return {ok:true};
  });
}, {prefix:'/api'});
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await app.listen({port:Number(process.env.PORT || 3000),host:'127.0.0.1'});
}
