import http from 'node:http';
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
function fail(status, message) { throw Object.assign(new Error(message), {status}); }
function field(data, key, max, optional=false) {
  const value = data[key];
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(400,'Check '+key+'.');
  return value.trim();
}
async function body(req) {
  if (req.headers['content-type'] !== 'application/json') fail(415,'Send JSON.');
  let input = '';
  for await (const chunk of req) {
    input += chunk;
    if (input.length > 16000) fail(413,'Form is too large.');
  }
  try { const value = JSON.parse(input); if (value && typeof value === 'object') return value; } catch {}
  fail(400,'Invalid form.');
}
const files = new Map([['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/style.css',['style.css','text/css']]]);
http.createServer(async (req,res) => {
  const reply = (data) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url,'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET' && files.has(path)) {
      const [file,type] = files.get(path);
      res.setHeader('Content-Type',type+'; charset=utf-8');
      return res.end(await readFile(new URL('./public/'+file,import.meta.url)));
    }
    res.setHeader('Cache-Control','no-store');
    const token = /(?:^|; )session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';
    const session = db.prepare('SELECT account FROM sessions WHERE token=? AND expires>?').get(token,Date.now());
    const id = session?.account;
    const me = () => db.prepare('SELECT '+profile+' FROM accounts WHERE id=?').get(id);
    if (req.method === 'GET') {
      if (path === '/api/me') return reply(id ? me() : null);
      if (!id) fail(401,'Sign in first.');
      if (path === '/api/flats') return reply(db.prepare('SELECT listings.*,name FROM listings JOIN accounts ON accounts.id=owner ORDER BY listings.id DESC').all());
      if (path === '/api/flatmates') return reply(db.prepare('SELECT id,name,about,hometown,hobbies FROM accounts WHERE discoverable=1 AND id<>? ORDER BY name').all(id));
      fail(404,'Page unavailable.');
    }
    if (req.method !== 'POST') fail(405,'Method unavailable.');
    const data = await body(req);
    if (path === '/api/register' || path === '/api/login') {
      const email = field(data,'email',254).toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) fail(400,'Enter a valid email.');
      const password = data.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 256) fail(400,'Use a password of 8–256 characters.');
      let account;
      if (path === '/api/register') {
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
      res.setHeader('Set-Cookie','session='+key+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800'+(process.env.COOKIE_SECURE==='1'?'; Secure':''));
      return reply({ok:true});
    }
    if (!id) fail(401,'Sign in first.');
    if (path === '/api/logout') {
      db.prepare('DELETE FROM sessions WHERE token=?').run(token);
      res.setHeader('Set-Cookie','session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
    } else if (path === '/api/mode') {
      if (!['search','post'].includes(data.mode)) fail(400,'Choose Search or Post.');
      db.prepare('UPDATE accounts SET mode=? WHERE id=?').run(data.mode,id);
    } else if (path === '/api/profile') {
      db.prepare('UPDATE accounts SET name=?,about=?,hometown=?,hobbies=?,discoverable=? WHERE id=?').run(field(data,'name',80),field(data,'about',600,true),field(data,'hometown',100,true),field(data,'hobbies',200,true),data.discoverable===true?1:0,id);
    } else if (path === '/api/flats') {
      const rent = Number(data.rent);
      if (!Number.isSafeInteger(rent) || rent<=0 || !['Whole flat','Private room','Shared room'].includes(data.kind) || !/^[A-Z]{3}$/.test(data.currency)) fail(400,'Check rent, currency and offer type.');
      db.prepare('INSERT INTO listings(owner,title,area,rent,currency,kind) VALUES(?,?,?,?,?,?)').run(id,field(data,'title',100),field(data,'area',100),rent,data.currency,data.kind);
    } else fail(404,'Page unavailable.');
    reply({ok:true});
  } catch(error) {
    res.statusCode = error.status || 500;
    if (!error.status) console.error(error);
    reply({error:error.status ? error.message : 'Request failed.'});
  }
}).listen(Number(process.env.PORT || 3000),'127.0.0.1');
