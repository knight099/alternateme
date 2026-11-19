import { PGlite } from '@electric-sql/pglite';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
const derive = promisify(scrypt);

function fail(statusCode,message) { throw Object.assign(new Error(message),{statusCode}); }
function field(body,key,max) {
  if(typeof body?.[key]!=='string'||body[key].length>max||!body[key].trim()) fail(400,'Check '+key+'.');
  return body[key].trim();
}
const sessionToken = req => /(?:^|;\s*)session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1] || '';

export async function openLocalStore({
  sqlitePath=process.env.DB_PATH || 'alternateme.sqlite',
  pgPath=process.env.LOCAL_PG_PATH || (sqlitePath === ':memory:' ? 'memory://' : sqlitePath+'.pgdata')
}={}) {
  const auth=new DatabaseSync(sqlitePath);
  auth.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS accounts(id INTEGER PRIMARY KEY,email TEXT UNIQUE,name TEXT,salt TEXT,hash TEXT,mode TEXT DEFAULT 'search',about TEXT DEFAULT '',hometown TEXT DEFAULT '',hobbies TEXT DEFAULT '',discoverable INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,account INTEGER REFERENCES accounts,expires INTEGER);
    CREATE TABLE IF NOT EXISTS listings(id INTEGER PRIMARY KEY,owner INTEGER REFERENCES accounts,title TEXT,area TEXT,rent INTEGER,currency TEXT,kind TEXT);`);
  const pg = new PGlite(pgPath);
  try {
    for(const name of ['schema','people','listings','social','photos']) {
      await pg.exec(await readFile(new URL('./'+name+'.sql',import.meta.url),'utf8'));
    }
    await pg.exec('CREATE TABLE IF NOT EXISTS alternateme_local_import(version integer PRIMARY KEY)');
    await pg.transaction(async tx=>{
      const {rows}=await tx.query('SELECT 1 FROM alternateme_local_import WHERE version=1');
      if(rows.length) return;
      for(const p of auth.prepare('SELECT * FROM accounts').iterate()) {
        await tx.query(`INSERT INTO alternateme_profiles(id,name,mode,about,hometown,hobbies,discoverable)
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[String(p.id),p.name,p.mode,p.about,p.hometown,p.hobbies,!!p.discoverable]);
      }
      for(const l of auth.prepare('SELECT * FROM listings').iterate()) {
        await tx.query(`INSERT INTO alternateme_listings(id,owner,title,area,rent,currency,kind) OVERRIDING SYSTEM VALUE
          VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,[l.id,String(l.owner),l.title,l.area,l.rent,l.currency,l.kind]);
      }
      await tx.query("SELECT setval(pg_get_serial_sequence('alternateme_listings','id'),coalesce(max(id),1),count(*)>0) FROM alternateme_listings");
      await tx.query('INSERT INTO alternateme_local_import VALUES(1)');
    });
  } catch(error) {auth.close();await pg.close();throw error;}
  // Neon queries are lazy so the same statements can be awaited individually or
  // passed to sql.transaction without executing outside the transaction.
  function query(statement,params=[]) {
    const run=async client=>(await client.query(statement,params)).rows;
    return {run,then(resolve,reject){return run(pg).then(resolve,reject);}};
  }
  function sql(strings,...params) {
    return query(strings.reduce((acc,s,i)=>acc+(i?'$'+i:'')+s,''),params);
  }
  sql.query=query;
  sql.transaction=statements=>pg.transaction(async tx=>{
    const results=[];
    for(const statement of statements) results.push(await statement.run(tx));
    return results;
  });
  const secureCookies = process.env.COOKIE_SECURE === '1';
  const cookie=(token,age)=>'session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+age+(secureCookies?'; Secure':'');
  function identity(req) {
    const row=auth.prepare('SELECT a.id,a.name,a.email FROM accounts a JOIN sessions s ON s.account=a.id WHERE s.token=? AND s.expires>?').get(sessionToken(req),Date.now());
    return row?{...row,id:String(row.id)}:null;
  }
  function authRoutes(app) {
    for(const route of ['register','login']) app.post('/api/'+route,async(req,reply)=>{
      const email=field(req.body,'email',254).toLowerCase();
      const password=req.body?.password;
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'Enter a valid email.');
      if(typeof password!=='string'||password.length<8||password.length>256) fail(400,'Use a password of 8–256 characters.');
      let id;
      if(route==='register') {
        const name=field(req.body,'name',80),salt=randomBytes(16).toString('hex');
        const hash=await derive(password,salt,64);
        const inserted=auth.prepare('INSERT INTO accounts(email,name,salt,hash) VALUES(?,?,?,?) ON CONFLICT(email) DO NOTHING').run(email,name,salt,hash.toString('hex'));
        if(!inserted.changes) fail(409,'Email already registered.');
        id=inserted.lastInsertRowid;
      } else {
        const row=auth.prepare('SELECT id,salt,hash FROM accounts WHERE email=?').get(email);
        const hash=await derive(password,row?.salt||email,64);
        if(!row || !timingSafeEqual(hash,Buffer.from(row.hash,'hex'))) fail(401,'Check your email and password.');
        id=row.id;
      }
      const token=randomBytes(32).toString('hex');
      auth.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      auth.prepare('INSERT INTO sessions VALUES(?,?,?)').run(token,id,Date.now()+604800000);
      reply.header('Set-Cookie',cookie(token,604800));
      return {ok:true};
    });
    app.post('/api/logout',async(req,reply)=>{
      auth.prepare('DELETE FROM sessions WHERE token=?').run(sessionToken(req));
      reply.header('Set-Cookie',cookie('',0));
      return {ok:true};
    });
  }
  async function deleteIdentity(req) {
    const user=identity(req);
    if(!user) fail(401,'Sign in first.');
    const row=auth.prepare('SELECT salt,hash FROM accounts WHERE id=?').get(user.id);
    if(!timingSafeEqual(await derive(req.body.password,row.salt,64),Buffer.from(row.hash,'hex'))) fail(403,'Check your password.');
    auth.exec('BEGIN');
    try {
      for(const command of ['DELETE FROM sessions WHERE account=?','DELETE FROM listings WHERE owner=?','DELETE FROM accounts WHERE id=?']) auth.prepare(command).run(user.id);
      auth.exec('COMMIT');
    } catch(error) {auth.exec('ROLLBACK');throw error;}
  }
  return {database:()=>sql,identity,authRoutes,deleteIdentity,secureCookies,async close(){auth.close();await pg.close();}};
}
