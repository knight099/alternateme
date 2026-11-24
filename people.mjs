import {HABITS,fitDirection,PROMPTS} from './people-fields.mjs';
export {fitDirection};
const areas=s=>String(s||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
function complete(h){
  return !!(h?.intent && areas(h.area).length && h.currency && h.minRent!=null && h.maxRent!=null && h.start && h.end);
}
export function profileComplete(p){return Boolean(p?.name?.trim() && p.housing?.city?.trim() && complete(p.housing));}
export function eligiblePair(a,b){
  const x=a.housing,y=b.housing;
  return !!(a.discoverable && b.discoverable && complete(x) && complete(y) &&
    !(x.intent==='Have a place' && y.intent==='Have a place') && x.city?.trim().toLowerCase()===y.city?.trim().toLowerCase() &&
    ['state','district'].every(key=>!x[key] || !y[key] || x[key].trim().toLowerCase()===y[key].trim().toLowerCase()) &&
    areas(x.area).some(v=>areas(y.area).includes(v)) && x.currency===y.currency &&
    x.minRent<=y.maxRent && y.minRent<=x.maxRent && x.start<=y.end && y.start<=x.end &&
    fitDirection(a.preferences,b.habits).eligible && fitDirection(b.preferences,a.habits).eligible);
}
export function publicPerson(p){
  const {id,name,about,city,languages,housing,habits,preferences}=p;
  return {id,name,about,city,languages,housing,habits,preferences,hometown:p.show_hometown?p.hometown:'',interests:p.interests.filter(i=>i.visible),prompts:p.prompts.filter(i=>i.visible)};
}
function validate(body,fail){
  const bad=label=>fail(400,'Check '+label+'.');
  const str=(v,max,label)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)bad(label);return v.trim();};
  const list=(v,max,label)=>{if(!Array.isArray(v)||v.length>max)bad(label);return v;};
  const data={};
  for(const [k,max] of Object.entries({name:80,city:100,hometown:100,languages:180,about:600})) data[k]=str(body[k],max,k);
  data.show_hometown=body.show_hometown===true;
  data.discoverable=body.discoverable===true;
  const raw=body.housing||{},h={};
  for(const [k,max] of Object.entries({intent:20,state:100,district:100,city:100,area:320,currency:3,kind:24,start:10,end:10,stay:80})) h[k]=str(raw[k],max,k);
  if(h.intent&&!['Have a place','Team up'].includes(h.intent))bad('housing intention');
  if(h.kind&&!['Whole flat','Private room','Shared room'].includes(h.kind))bad('offer type');
  if(h.currency&&!/^[A-Z]{3}$/i.test(h.currency))bad('currency');
  for(const k of ['minRent','maxRent']){
    h[k]=raw[k]==null||raw[k]===''?null:Number(raw[k]);
    if(h[k]!=null&&(!Number.isSafeInteger(h[k])||h[k]<0))bad(k);
  }
  for(const d of [h.start,h.end]) if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))bad('move date');
  if(h.minRent!=null&&h.maxRent!=null&&h.minRent>h.maxRent || h.start&&h.end&&h.start>h.end)bad('housing ranges');
  h.currency=h.currency.toUpperCase();
  data.housing=h;data.habits={};data.preferences={};
  for(const [key,[label,...options]] of Object.entries(HABITS)){
    const answer=body.habits?.[key],p=body.preferences?.[key];
    if(answer){if(!options.includes(answer))bad(label);data.habits[key]=answer;}
    if(p&&p.priority!=='none'){
      if(!['required','flexible','important'].includes(p.priority)||!Array.isArray(p.choices)||(body.action==='publish'&&!p.choices.length)||p.choices.some(c=>!options.includes(c)))bad(label+' preferences');
      data.preferences[key]={priority:p.priority,choices:[...new Set(p.choices)]};
    }
  }
  data.interests=list(body.interests||[],15,'interests').map(i=>({tag:str(i?.tag,48,'interest'),detail:str(i?.detail,240,'interest detail'),visible:i?.visible===true})).filter(i=>i.tag);
  data.prompts=list(body.prompts||[],3,'prompts').map(i=>({question:str(i?.question,100,'prompt'),answer:str(i?.answer,350,'answer'),visible:i?.visible===true,featured:i?.featured===true})).filter(i=>i.answer||body.action==='draft');
  if(data.prompts.some(i=>!PROMPTS.includes(i.question))||data.prompts.filter(i=>i.featured).length>1)bad('featured prompts');
  if(body.action==='publish'&&!profileComplete(data))bad('name, housing intention, target city, areas, budget and move window');
  return data;
}
export function registerPeople(api,{database,fail}){
  api.post('/member-profile',async req=>{
    if(!['draft','publish'].includes(req.body?.action))fail(400,'Choose a save action.');
    const p=validate(req.body,fail),sql=database();
    if(req.body.action==='draft'){
      await sql`UPDATE alternateme_profiles SET profile_draft=${JSON.stringify(p)}::jsonb WHERE id=${req.userId}`;
    }else{
      await sql`UPDATE alternateme_profiles SET name=${p.name},about=${p.about},city=${p.city},languages=${p.languages},hometown=${p.hometown},show_hometown=${p.show_hometown},housing=${JSON.stringify(p.housing)}::jsonb,habits=${JSON.stringify(p.habits)}::jsonb,preferences=${JSON.stringify(p.preferences)}::jsonb,interests=${JSON.stringify(p.interests)}::jsonb,prompts=${JSON.stringify(p.prompts)}::jsonb,discoverable=${p.discoverable},hobbies='',profile_draft=NULL,profile_activity=now() WHERE id=${req.userId}`;
    }
    return {ok:true};
  });
  api.get('/people/:id',async req=>{
    const [p]=await database()`SELECT p.* FROM alternateme_profiles p WHERE p.id=${req.params.id} AND p.discoverable AND NOT EXISTS(SELECT 1 FROM alternateme_pairs d WHERE d.a=LEAST(p.id,${req.userId}) AND d.b=GREATEST(p.id,${req.userId}) AND (d.a_block OR d.b_block))`;
    if(!p)fail(404,'Profile unavailable.');
    return publicPerson(p);
  });
  api.get('/people',async req=>{
    const sql=database();
    const [me]=await sql`SELECT * FROM alternateme_profiles WHERE id=${req.userId}`;
    if(!me?.discoverable)return [];
    const rows=await sql`SELECT p.* FROM alternateme_profiles p WHERE p.discoverable AND p.id<>${req.userId} AND NOT EXISTS (SELECT 1 FROM alternateme_pairs d WHERE d.a=LEAST(p.id,${req.userId}) AND d.b=GREATEST(p.id,${req.userId}) AND (d.a_block OR d.b_block OR d.connected OR CASE WHEN d.a=${req.userId} THEN d.a_vote ELSE d.b_vote END IS NOT NULL)) ORDER BY p.profile_activity DESC,p.id`;
    const tags=new Set(me.interests.filter(i=>i.visible).map(i=>i.tag.toLowerCase()));
    return rows.filter(p=>eligiblePair(me,p)).map(p=>({...publicPerson(p),fit:fitDirection(me.preferences,p.habits),reverseFit:fitDirection(p.preferences,me.habits),shared:p.interests.filter(i=>i.visible&&tags.has(i.tag.toLowerCase())).map(i=>i.tag)})).sort((a,b)=>(b.fit.score??-1)-(a.fit.score??-1));
  });
}
