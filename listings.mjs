import {fields,required,amenities,matches} from './listing-fields.mjs';
import {fitDirection,HABITS} from './people-fields.mjs';

export function listingFit(details,profile){
  return {seeker:fitDirection(profile.preferences||{},details.habits||{}),household:fitDirection(details.preferences||{},profile.habits||{})};
}
function terms(body,fail){
  if(!body || typeof body!=='object') fail(400,'Enter the listing details.');
  const values={};
  for(const [key,label,type,max] of fields){
    let v=body[key];
    if(v==null||v===''){if(required.includes(key)) fail(400,'Enter '+label.toLowerCase()+'.');continue;}
    const invalid=()=>fail(400,'Check '+label.toLowerCase()+'.');
    if(Array.isArray(type)){if(!type.includes(v)) invalid();}
    else if(['money','count','lat','lon'].includes(type)){
      if(!['number','string'].includes(typeof v)||!String(v).trim()) invalid();
      v=Number(v);
      if(type==='lat'||type==='lon'){
        if(!Number.isFinite(v)||Math.abs(v)>(type==='lat'?90:180)) invalid();
        v=Math.round(v*100)/100;
      }else if(!Number.isSafeInteger(v)||v<(key==='rent'?1:0)||v>1000000000) invalid();
    }else{
      if(typeof v!=='string'||!(v=v.trim())||v.length>(max||10)) invalid();
      if(type==='currency'&&!/^[A-Z]{3}$/.test(v)) invalid();
      if(type==='date'&&(!/^\d{4}-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)) invalid();
    }
    values[key]=v;
  }
  if((values.latitude==null)!==(values.longitude==null)) fail(400,'Enter both approximate coordinates.');
  const features=body.amenities||[];
  if(!Array.isArray(features)||features.some(a=>!amenities.includes(a))) fail(400,'Check the amenities.');
  values.amenities=[...new Set(features)];
  for(const key of ['habits','preferences']){
    const obj=body[key]||{};
    if(typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).length>20) fail(400,'Check household answers.');
    for(const [k,v] of Object.entries(obj)){
      const choices=Object.hasOwn(HABITS,k)?HABITS[k].slice(1):[];
      if(key==='habits' ? !choices.includes(v) : !v||!['required','important','flexible'].includes(v.priority)||!Array.isArray(v.choices)||!v.choices.length||v.choices.some(c=>!choices.includes(c))) fail(400,'Check household conditions.');
    }
    values[key]=obj;
  }
  return values;
}
export function registerListings(api,{database,fail}){
  const id=req=>{const v=Number(req.params.id);if(!Number.isSafeInteger(v)||v<1||v>2147483647) fail(404,'Listing unavailable.');return v;};
  const row=l=>({...l.details,...l,available:l.available?String(l.available).slice(0,10):'',details:undefined});
  async function visible(req,listingId=null){
    const sql=database();
    return sql`SELECT l.*, (SELECT image.id FROM alternateme_photos image WHERE image.listing_id=l.id ORDER BY image.position,image.id LIMIT 1) AS cover,to_char(l.available,'YYYY-MM-DD') AS available,p.name FROM alternateme_listings l JOIN alternateme_profiles p ON p.id=l.owner WHERE
      (${listingId}::integer IS NULL OR l.id=${listingId}) AND
      ((l.status='open' AND ${req.query.scope!=='mine'}) OR (l.owner=${req.userId} AND (${req.query.scope==='mine'} OR ${listingId}::integer IS NOT NULL))) AND
      NOT EXISTS (SELECT 1 FROM alternateme_pairs b WHERE l.owner<>${req.userId} AND ${req.userId} IN (b.a,b.b) AND l.owner IN (b.a,b.b) AND (b.a_block OR b.b_block))
      ORDER BY l.id DESC`;
  }
  api.get('/listings',async req=>{
    const q=req.query;
    if((q.sort==='rent'||q.minRent||q.maxRent||q.maxDeposit)&&!q.currency) fail(400,'Select a currency for price filters and sorting.');
    for(const k of ['minRent','maxRent','maxDeposit','bedrooms','occupancy','stay','size','radius']){
      if(q[k]&&(!Number.isFinite(Number(q[k]))||Number(q[k])<0)) fail(400,'Check numerical filters.');
    }
    if(q.minRent&&q.maxRent&&Number(q.minRent)>Number(q.maxRent)) fail(400,'Maximum rent must cover minimum rent.');
    if(q.radius && (!q.lat||!q.lon||!Number.isFinite(Number(q.lat))||!Number.isFinite(Number(q.lon))||Math.abs(Number(q.lat))>90||Math.abs(Number(q.lon))>180)) fail(400,'Enter the centre coordinates for the radius search.');
    let rows=(await visible(req)).map(row).filter(l=>matches(l,q));
    if(q.sort==='rent') rows.sort((a,b)=>a.rent-b.rent||b.id-a.id);
    return rows;
  });
  api.get('/listings/:id',async req=>{
    const [l]=await visible(req,id(req));if(!l) fail(404,'Listing unavailable.');
    const [profile]=await database()`SELECT preferences,habits FROM alternateme_profiles WHERE id=${req.userId}`;
    return {...row(l),fit:listingFit(l.details,profile)};
  });
  async function save(req,edit){
    const {title,city,area,kind,rent,currency,available,...details}=terms(req.body,fail);
    const sql=database();
    const rows=edit?await sql`UPDATE alternateme_listings SET title=${title},city=${city},area=${area},kind=${kind},rent=${rent},currency=${currency},available=${available},details=${JSON.stringify(details)}::jsonb WHERE id=${id(req)} AND owner=${req.userId} RETURNING id,status`
      :await sql`INSERT INTO alternateme_listings(owner,title,city,area,kind,rent,currency,available,details,status) VALUES(${req.userId},${title},${city},${area},${kind},${rent},${currency},${available},${JSON.stringify(details)}::jsonb,'draft') RETURNING id,status`;
    if(!rows.length) fail(404,'Listing unavailable.');return rows[0];
  }
  api.post('/listings',req=>save(req,false));
  api.post('/listings/:id',req=>save(req,true));
  api.post('/listings/:id/status',async req=>{
    const status=req.body?.status;
    if(!['open','paused','filled'].includes(status)) fail(400,'Choose a listing status.');
    const [updated]=await database()`UPDATE alternateme_listings SET status=${status} WHERE owner=${req.userId} AND id=${id(req)} RETURNING id,status`;
    if(!updated) fail(404,'Listing unavailable.');return updated;
  });
}
