import {Readable} from 'node:stream';
import {setTimeout as delay} from 'node:timers/promises';
import {eligiblePair} from './people.mjs';
import {listingFit} from './listings.mjs';
export function registerSocial(api,{database,fail}) {
  function subject(req) {
    const target=req.body?.target;
    if(typeof target!=='string'||!target.trim()||target.length>256||target===req.userId) fail(400,'Choose another member.');
    return target;
  }
  function pairId(req) {
    const value=req.params.id;
    if(!/^[1-9]\d{0,18}$/.test(value)||BigInt(value)>9223372036854775807n) fail(400,'Invalid conversation.');
    return value;
  }
  function required(rows) {
    if(!rows.length) fail(404,'This action is unavailable.');
    return rows[0];
  }
  api.post('/decisions',async req=>{
    const me=req.userId, target=subject(req), vote=req.body.vote;
    if(!['like','pass'].includes(vote)) fail(400,'Choose like or pass.');
    const sql=database();
    const profiles=await sql`SELECT * FROM alternateme_profiles WHERE id IN (${me},${target})`;
    if(profiles.length!==2 || !eligiblePair(profiles.find(p=>p.id===me),profiles.find(p=>p.id===target))) fail(404,'Profile unavailable.');
    return required(await sql`WITH decision AS (
      INSERT INTO alternateme_pairs AS p(a,b,a_vote,b_vote)
      SELECT least(${me}::text COLLATE "C",id),greatest(${me}::text COLLATE "C",id),
        CASE WHEN ${me}::text COLLATE "C"<id THEN ${vote}::text END,
        CASE WHEN ${me}::text COLLATE "C">id THEN ${vote}::text END
      FROM alternateme_profiles WHERE id=${target} AND discoverable
      ON CONFLICT(a,b) DO UPDATE SET
        a_vote=coalesce(excluded.a_vote,p.a_vote), b_vote=coalesce(excluded.b_vote,p.b_vote),
        connected=p.connected OR coalesce(coalesce(excluded.a_vote,p.a_vote)='like' AND coalesce(excluded.b_vote,p.b_vote)='like',false)
      WHERE NOT(p.a_block OR p.b_block) AND (CASE WHEN p.a=${me} THEN p.a_vote ELSE p.b_vote END IS NULL OR CASE WHEN p.a=${me} THEN p.a_vote ELSE p.b_vote END=${vote}) RETURNING id,connected
      ), matched AS (INSERT INTO alternateme_threads(pair_id,state,needs_intro) SELECT id,'open',true FROM decision WHERE connected
        ON CONFLICT(pair_id) WHERE listing_id IS NULL DO NOTHING)
      SELECT * FROM decision`);
  });
  api.post('/requests',async req=>{
    const me=req.userId, listing=req.body?.listing;
    if(!Number.isSafeInteger(listing)||listing<1||listing>2147483647) fail(400,'Choose a listing.');
    const question=req.body?.question;
    if(typeof question!=='string'||!question.trim()||question.length>2000) fail(400,'Enter your question in 2000 characters or fewer.');
    const sql=database();
    const [existing]=await sql`SELECT t.id,t.state,t.requester FROM alternateme_threads t JOIN alternateme_pairs p ON t.pair_id=p.id WHERE t.listing_id=${listing} AND t.requester=${me} AND NOT(p.a_block OR p.b_block)`;
    if(existing) return existing;
    return required(await sql`WITH offer AS (
      SELECT owner,id FROM alternateme_listings WHERE id=${listing} AND status='open' AND owner<>${me} FOR SHARE
    ), allowed AS (
      INSERT INTO alternateme_pairs AS p(a,b,intro_a,intro_b) SELECT least(${me}::text COLLATE "C",owner),greatest(${me}::text COLLATE "C",owner),
        CASE WHEN ${me}::text COLLATE "C"<owner THEN ${String(listing)} END,CASE WHEN ${me}::text COLLATE "C">owner THEN ${String(listing)} END FROM offer
      ON CONFLICT(a,b) DO UPDATE SET intro_a=coalesce(excluded.intro_a,p.intro_a),intro_b=coalesce(excluded.intro_b,p.intro_b)
      WHERE NOT(p.a_block OR p.b_block) AND coalesce(CASE WHEN p.a=${me} THEN p.intro_a ELSE p.intro_b END,${String(listing)})=${String(listing)} RETURNING id
    ) INSERT INTO alternateme_threads AS t(pair_id,listing_id,requester,question,state)
      SELECT id,${listing},${me},${question.trim()},'pending' FROM allowed
      ON CONFLICT(listing_id,requester) WHERE listing_id IS NOT NULL DO UPDATE SET question=t.question
      RETURNING id,state,requester`);
  });
  api.post('/threads/:id/intro',async req=>{
    const me=req.userId,body=req.body?.body;
    if(typeof body!=='string'||!body.trim()||body.length>2000) fail(400,'Enter one introductory message.');
    const rows=await database()`WITH gate AS (UPDATE alternateme_pairs p SET
      intro_a=CASE WHEN p.a=${me} THEN 'match' ELSE p.intro_a END,
      intro_b=CASE WHEN p.b=${me} THEN 'match' ELSE p.intro_b END
      FROM alternateme_threads t WHERE t.id=${pairId(req)} AND t.pair_id=p.id AND t.needs_intro AND t.state='open'
      AND ${me} IN(p.a,p.b) AND NOT(p.a_block OR p.b_block) AND (CASE WHEN p.a=${me} THEN p.intro_a ELSE p.intro_b END) IS NULL AND (CASE WHEN p.a=${me} THEN p.intro_b ELSE p.intro_a END) IS DISTINCT FROM 'match' RETURNING p.id)
      UPDATE alternateme_threads t SET question=${body.trim()},intro_sender=${me},state='pending',needs_intro=false
      FROM gate WHERE t.pair_id=gate.id AND t.id=${pairId(req)} AND t.needs_intro AND t.state='open' RETURNING t.id`;
    if(!rows.length) fail(409,'An introduction is pending or this conversation is unavailable.');
    return rows[0];
  });
  api.post('/threads/:id/respond',async req=>{
    const me=req.userId, accept=req.body?.accept;
    if(typeof accept!=='boolean') fail(400,'Choose accept or decline.');
    return required(await database()`WITH response AS (UPDATE alternateme_threads t SET state=${accept?'open':'closed'}
      FROM alternateme_pairs p WHERE t.id=${pairId(req)} AND t.pair_id=p.id AND ${me} IN(p.a,p.b)
      AND coalesce(t.requester,t.intro_sender)<>${me} AND t.state='pending' AND NOT(p.a_block OR p.b_block) RETURNING t.id,t.pair_id,coalesce(t.listing_id::text,'match') AS origin), released AS (UPDATE alternateme_pairs p SET intro_a=CASE WHEN p.b=${me} AND intro_a=r.origin THEN NULL ELSE intro_a END,intro_b=CASE WHEN p.a=${me} AND intro_b=r.origin THEN NULL ELSE intro_b END FROM response r WHERE p.id=r.pair_id AND ${accept}) SELECT id FROM response`);
  });
  api.post('/threads/:id/unmatch',async req=>required(await database()`WITH unmatched AS (
    UPDATE alternateme_pairs p SET connected=false,a_vote='pass',b_vote='pass' FROM alternateme_threads t
    WHERE t.id=${pairId(req)} AND p.id=t.pair_id AND t.listing_id IS NULL AND ${req.userId} IN(p.a,p.b) RETURNING p.id
    ) UPDATE alternateme_threads t SET state='closed' FROM unmatched WHERE t.pair_id=unmatched.id AND listing_id IS NULL RETURNING t.id`));
  api.get('/inbox',async req=>{
    const rows=await database()`SELECT t.id,t.state,t.question,t.needs_intro,coalesce(t.requester,t.intro_sender) AS requester,l.title,l.status AS listing_status,l.details,
      viewer.interests AS mine,peer.interests AS theirs, seeker.preferences,seeker.habits,
      peer.id AS peer,peer.name FROM alternateme_threads t JOIN alternateme_pairs p ON p.id=t.pair_id
      JOIN alternateme_profiles viewer ON viewer.id=${req.userId}
      JOIN alternateme_profiles peer ON peer.id=CASE WHEN p.a=viewer.id THEN p.b ELSE p.a END
      LEFT JOIN alternateme_listings l ON t.listing_id=l.id LEFT JOIN alternateme_profiles seeker ON t.requester=seeker.id
      WHERE viewer.id IN(p.a,p.b) AND NOT(p.a_block OR p.b_block) AND t.state<>'closed' ORDER BY t.id DESC`;
    return rows.map(({mine,theirs,details,preferences,habits,...t})=>({...t,connected:t.state==='open',
      shared:(mine||[]).filter(i=>i.visible && (theirs||[]).some(j=>j.visible && i.tag.toLowerCase()===j.tag.toLowerCase())).map(i=>i.tag),
      fit:t.title?listingFit(details||{},{preferences,habits}):null}));
  });
  api.get('/threads/:id/messages',async req=>{
    const id=pairId(req),before=req.query?.before;
    if(before!==undefined && (!/^[1-9]\d{0,18}$/.test(before)||BigInt(before)>9223372036854775807n)) fail(400,'Invalid message cursor.');
    const rows=await database()`SELECT coalesce(json_agg(m ORDER BY m.id) FILTER(WHERE m.id IS NOT NULL),'[]') AS messages
      FROM alternateme_threads t JOIN alternateme_pairs p ON p.id=t.pair_id LEFT JOIN LATERAL (SELECT id::text AS id,sender,body,created_at FROM alternateme_messages
        WHERE thread_id=t.id AND (${before??null}::bigint IS NULL OR id<${before??null}::bigint) ORDER BY alternateme_messages.id DESC LIMIT 100) m ON true
      WHERE t.id=${id} AND ${req.userId} IN(p.a,p.b) AND t.state='open' AND NOT(p.a_block OR p.b_block) GROUP BY t.id`;
    return required(rows).messages.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
  });
  api.get('/threads/:id/events',async(req,reply)=>{
    const id=pairId(req),me=req.userId;
    let cursor=req.headers['last-event-id']||req.query?.after||'0';
    if(!/^\d{1,19}$/.test(cursor)||BigInt(cursor)>9223372036854775807n) fail(400,'Invalid message cursor.');
    const sql=database();
    async function read() {
      const [row]=await sql`SELECT coalesce(json_agg(m ORDER BY m.id::bigint) FILTER(WHERE m.id IS NOT NULL),'[]') AS messages
        FROM alternateme_threads t JOIN alternateme_pairs p ON p.id=t.pair_id LEFT JOIN LATERAL
        (SELECT id::text,sender,body,created_at FROM alternateme_messages WHERE thread_id=t.id AND id>${cursor}::bigint
         ORDER BY alternateme_messages.id LIMIT 100) m ON true WHERE t.id=${id} AND ${me} IN(p.a,p.b) AND t.state='open'
         AND NOT(p.a_block OR p.b_block) GROUP BY t.id`;
      return row;
    }
    const initial=await read();
    if(!initial) fail(404,'Conversation unavailable.');
    async function* events(){
      let row=initial;
      const end=Date.now()+20000;
      yield 'retry: 1500\n\n';
      while(!reply.raw.destroyed && Date.now()<end){
        if(!row){yield 'event: closed\ndata: {}\n\n';break;}
        for(const message of row.messages){
          cursor=message.id;
          yield 'id: '+cursor+'\ndata: '+JSON.stringify(message)+'\n\n';
        }
        if(row.messages.length<100) await delay(1500);
        if(reply.raw.destroyed) break;
        row=await read();
      }
    }
    return reply.type('text/event-stream').header('X-Accel-Buffering','no').send(Readable.from(events()));
  });
  api.post('/threads/:id/messages',async req=>{
    const id=pairId(req),me=req.userId,body=typeof req.body?.body==='string'?req.body.body.trim():'', token=req.body?.token;
    if(typeof body!=='string'||!body||body.length>2000||typeof token!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(token)) fail(400,'Check the message.');
    return required(await database()`WITH allowed AS (SELECT t.id FROM alternateme_threads t JOIN alternateme_pairs p ON p.id=t.pair_id WHERE t.id=${id} AND ${me} IN(a,b)
      AND t.state='open' AND NOT t.needs_intro AND NOT(a_block OR b_block) FOR UPDATE OF p,t)
      INSERT INTO alternateme_messages AS m(thread_id,sender,token,body) SELECT id,${me},${token},${body} FROM allowed
      ON CONFLICT(thread_id,sender,token) DO UPDATE SET body=m.body WHERE m.body=excluded.body RETURNING id`);
  });
  api.post('/blocks',async req=>{
    const me=req.userId,target=subject(req);
    return required(await database()`INSERT INTO alternateme_pairs AS p(a,b,a_block,b_block)
      SELECT least(${me}::text COLLATE "C",id),greatest(${me}::text COLLATE "C",id),${me}::text COLLATE "C"<id,${me}::text COLLATE "C">id
      FROM alternateme_profiles WHERE id=${target}
      ON CONFLICT(a,b) DO UPDATE SET a_block=p.a_block OR excluded.a_block,b_block=p.b_block OR excluded.b_block RETURNING id`);
  });
  api.post('/reports',async req=>{
    const reason=req.body?.reason;
    if(typeof reason!=='string'||!reason.trim()||reason.length>500) fail(400,'Describe your concern in 500 characters or fewer.');
    const context=req.body?.context||'profile';
    if(typeof context!=='string'||! /^(profile|listing:[0-9]+|message:[0-9]+)$/.test(context)||context.length>32) fail(400,'Invalid report context.');
    const target=subject(req), [kind,source]=context.split(':');
    if(source && (BigInt(source)>9223372036854775807n || BigInt(source)<1n)) fail(400,'Invalid report context.');
    required(await database()`INSERT INTO alternateme_reports(reporter,subject,reason,context)
      SELECT ${req.userId},member.id,${reason.trim()},${context} FROM alternateme_profiles member WHERE member.id=${target}
      AND (${kind}='profile' OR (${kind}='listing' AND EXISTS (SELECT 1 FROM alternateme_listings WHERE id=${source??null}::bigint AND owner=member.id))
        OR (${kind}='message' AND EXISTS (SELECT 1 FROM alternateme_messages m JOIN alternateme_threads t ON m.thread_id=t.id
          JOIN alternateme_pairs p ON p.id=t.pair_id WHERE m.id=${source??null}::bigint AND m.sender=member.id AND ${req.userId} IN(p.a,p.b))))
      RETURNING id`);
    return {ok:true};
  });
  function moderator(req) {return (process.env.MODERATOR_USER_IDS||'').split(',').map(id=>id.trim()).includes(req.userId);}
  api.get('/moderation/access',async req=>({allowed:moderator(req)}));
  api.get('/moderation/reports',async req=>{
    if(!moderator(req)) fail(403,'Moderator access required.');
    return database()`SELECT r.id,r.subject,r.context,r.reason,r.created_at,p.name FROM alternateme_reports r JOIN alternateme_profiles p ON p.id=r.subject WHERE r.reviewed_at IS NULL ORDER BY r.id LIMIT 100`;
  });
  api.post('/moderation/reports/:id/review',async req=>{
    if(!moderator(req)) fail(403,'Moderator access required.');
    return required(await database()`UPDATE alternateme_reports SET reviewed_at=now() WHERE id=${pairId(req)} RETURNING id`);
  });
}
