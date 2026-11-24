import React,{useEffect,useState} from 'react';
import {PhotoGallery} from './Photos.jsx';
import {Contact} from './Social.jsx';
import {PublicMember} from './People.jsx';
import {fields,amenities,required} from './listing-fields.mjs';
import {HABITS} from './people-fields.mjs';

async function request(path='',body){
  const r=await fetch('/api/listings'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load listings.');return data;
}
const filterFields=[
  ['state','State or union territory','text'],['district','District','text'],['city','City','text'],['area','Neighbourhoods, separated by commas','text'],
  ['keyword','Search listing text','text'],['currency','Currency code','currency'],['minRent','Minimum monthly rent','money'],['maxRent','Maximum monthly rent','money'],
  ['maxDeposit','Maximum deposit','money'],['kind','Offer type'],['bedrooms','Minimum bedrooms','count'],['privateBath','Private bathroom'],
  ['occupancy','Occupants to accommodate','count'],['move','Move-in date','date'],['stay','Intended stay in months','count'],
  ['lease','Lease type'],['furnishing','Furnishing'],['pets','Pet policy'],['smoking','Smoking policy'],['size','Maximum household size','count'],
  ['utilities','Utilities'],['noBrokerage','Brokerage',['No fee']],['lat','Search centre latitude','lat'],['lon','Search centre longitude','lon'],
  ['radius','Radius in kilometres','count'],['sort','Sort order',['rent']]
].map(([k,label,t])=>[k,label,t||fields.find(f=>f[0]===k)[2]]);
function Field({item,values,change,mandatory=false}){
  const [k,label,type,max]=item;
  const props={value:values[k]??'',required:mandatory,onChange:e=>change(k,type==='currency'?e.target.value.toUpperCase():e.target.value)};
  const num=['money','count','lat','lon'].includes(type);
  return <label>{label}{Array.isArray(type)?<select {...props}><option value="">{k==='sort'?'Newest first':'Select an option'}</option>{type.map(o=><option key={o} value={o}>{o==='rent'?'Lowest monthly rent':o}</option>)}</select>
    :type==='long'?<textarea {...props} maxLength={max}/>:<input {...props} type={num?'number':type==='date'?'date':'text'} min={num?(type==='lat'?-90:type==='lon'?-180:k==='rent'?1:0):undefined} max={type==='lat'?90:type==='lon'?180:undefined} step={['lat','lon'].includes(type)?'0.01':num?1:undefined} maxLength={type==='currency'?3:max} pattern={type==='currency'?'[A-Z]{3}':undefined}/>}</label>;
}
function Features({selected,toggle}){
  return <fieldset><legend>Amenities</legend>{amenities.map(a=><label key={a}><input type="checkbox" checked={selected.includes(a)} onChange={()=>toggle(selected.includes(a)?selected.filter(i=>i!==a):[...selected,a])}/>{a}</label>)}</fieldset>;
}
function Household({value,change}){
  function setAnswer(k,v){const habits={...value.habits};if(v)habits[k]=v;else delete habits[k];change('habits',habits);}
  function setRule(k,p){const preferences={...value.preferences};if(p.priority)preferences[k]=p;else delete preferences[k];change('preferences',preferences);}
  return <details><summary>Household habits and flatmate preferences</summary>{Object.entries(HABITS).map(([k,[label,...options]])=>{
    const rule=value.preferences?.[k]||{priority:'',choices:[]};
    return <fieldset key={k}><legend>{label}</legend><label>Household answer<select value={value.habits?.[k]||''} onChange={e=>setAnswer(k,e.target.value)}><option value="">Unknown</option>{options.map(o=><option key={o}>{o}</option>)}</select></label>
      <label>Preference for a flatmate<select value={rule.priority} onChange={e=>setRule(k,{...rule,priority:e.target.value})}><option value="">No preference</option>{['required','important','flexible'].map(o=><option key={o}>{o}</option>)}</select></label>
      {rule.priority&&options.map(o=><label key={o}><input type="checkbox" checked={rule.choices.includes(o)} onChange={e=>setRule(k,{...rule,choices:e.target.checked?[...rule.choices,o]:rule.choices.filter(c=>c!==o)})}/>{o}</label>)}</fieldset>;
  })}</details>;
}
function Editor({listing,onSaved,onCancel}){
  const [value,set]=useState(listing||{}),[busy,lock]=useState(false),[error,notify]=useState('');
  const change=(k,v)=>set(prev=>({...prev,[k]:v}));
  return <form onSubmit={async e=>{e.preventDefault();if(busy)return;lock(true);notify('');try{const saved=await request(listing?'/'+listing.id:'',value);onSaved(saved.id);}catch(err){notify(err.message);}finally{lock(false);}}}>
    <h2>{listing?'Edit listing':'Create a listing'}</h2><fieldset disabled={busy}>
    {fields.map(item=><Field key={item[0]} item={item} values={value} change={change} mandatory={required.includes(item[0])}/>)}
    <Features selected={value.amenities||[]} toggle={v=>change('amenities',v)}/><Household value={value} change={change}/>
    <button>{listing?'Save changes':'Save draft and preview'}</button><button type="button" onClick={onCancel}>Cancel</button></fieldset><p role="alert">{error}</p></form>;
}
function Fit({fit,title}){
  return <details><summary>{title} · {fit.score==null?'More answers needed':fit.score+'%'} · {fit.answered}/{fit.applicable} answered</summary>
    {Object.entries({conflicts:'Required conflicts',needsConfirmation:'Needs confirmation',agreements:'Agreements',differences:'Differences',unknowns:'Unknowns'}).map(([k,label])=>fit[k]?.length>0&&<p key={k}><b>{label}</b> · {fit[k].join(', ')}</p>)}</details>;
}
const price=l=>l.currency+' '+Number(l.rent).toLocaleString()+' / month '+(l.kind==='Whole flat'?'for the whole flat':'for the room');
function Detail({data:l,user,edit,transition,back,busy}){
  const own=l.owner===user.id;
  return <article><button onClick={back}>Back to listings</button><h2>{l.title}</h2><p>{[l.kind,l.area,l.city].filter(Boolean).join(' · ')}</p><p><strong>{price(l)}</strong></p>
    <PhotoGallery kind="listing" id={l.id} editable={own}/><p>{l.description}</p><dl>{fields.slice(6).filter(([k])=>!['description','latitude','longitude'].includes(k)).map(([k,label,type])=><React.Fragment key={k}><dt>{label}</dt><dd>{l[k]==null||l[k]===''?'Unknown':(type==='money'?l.currency+' ':'')+l[k]}</dd></React.Fragment>)}
    <dt>Amenities</dt><dd>{l.amenities?.join(', ')||'Unknown'}</dd>{l.latitude!=null&&<><dt>Approximate location</dt><dd>{l.latitude}, {l.longitude}</dd></>}</dl>
    <h3>Household conditions</h3>{Object.entries(HABITS).map(([k,[label]])=><p key={k}>{label} · {l.habits?.[k]||'Unknown'}{l.preferences?.[k]&&' · '+l.preferences[k].priority+' for flatmate: '+l.preferences[k].choices.join(' or ')}</p>)}
    <p>Posted by {l.name}{l.role?' · '+l.role:''}</p>{l.role==='Live-in flatmate'&&<details><summary>View poster profile</summary><PublicMember id={l.owner}/></details>}
    {!own&&l.fit&&<><Fit title="Fits your search" fit={l.fit.seeker}/><Fit title="Fits the household’s preferences" fit={l.fit.household}/><Contact listing={l} user={user}/></>}
    {own&&<fieldset disabled={busy}><legend>Manage listing · {l.status}</legend><button onClick={edit}>Edit listing</button>
      {l.status!=='open'&&<button onClick={()=>transition('open')}>{l.status==='draft'?'Publish listing':'Reopen listing'}</button>}
      {l.status==='open'&&<button onClick={()=>transition('paused')}>Pause listing</button>}{['open','paused'].includes(l.status)&&<button onClick={()=>transition('filled')}>Mark filled</button>}</fieldset>}
  </article>;
}
const readUrl=()=>Object.fromEntries(new URLSearchParams(location.search));
export function Listings({user,mode}){
  return <ListingView key={mode} user={user} mode={mode}/>;
}
function ListingView({user,mode}){
  function initialFilters(){
    const explicit=readUrl();
    if(mode!=='recommended'||Object.keys(explicit).length) return explicit;
    const h=user.housing||{};
    return {state:h.state,district:h.district,city:h.city,area:h.area,currency:h.currency,minRent:String(h.minRent??''),maxRent:String(h.maxRent??''),kind:h.kind,move:h.end};
  }
  const mine=mode==='post', [url,setUrl]=useState(initialFilters),[filters,setFilters]=useState(initialFilters),[editor,edit]=useState(false);
  const [rows,setRows]=useState(null),[detail,setDetail]=useState(null),[error,notify]=useState(''),[busy,lock]=useState(false),[version,refresh]=useState(0);
  const listing=url[mine?'postId':'listing'];
  function navigate(next){const u=new URL(location.href);u.search=new URLSearchParams(Object.entries(next).filter(([,v])=>v!==''&&v!=null)).toString();history.pushState(null,'',u);setUrl(next);edit(false);}
  function open(id){navigate({...url,[mine?'postId':'listing']:id||''});}
  useEffect(()=>{const pop=()=>{setUrl(readUrl());setFilters(readUrl());edit(false);};window.addEventListener('popstate',pop);return ()=>window.removeEventListener('popstate',pop);},[]);
  useEffect(()=>{
    let live=true;setDetail(null);setRows(null);notify('');
    const q=new URLSearchParams();if(mine)q.set('scope','mine');else for(const k of [...filterFields.map(f=>f[0]),'amenities'])if(url[k])q.set(k,url[k]);
    request(listing?'/'+encodeURIComponent(listing):'?'+q).then(data=>{if(live)(listing?setDetail:setRows)(data);}).catch(e=>{if(live)notify(e.message);});return ()=>{live=false;};
  },[mine,url,listing,version]);
  const change=(k,v)=>setFilters(f=>({...f,[k]:v}));
  function apply(f){setFilters(f);navigate({...f,listing:''});}
  return <section><h1>{mine?'Your listings':mode==='recommended'?'Flats for you':'Find a flat'}</h1>{error&&<p role="alert">{error}</p>}
    {editor?<Editor listing={detail} onSaved={id=>{open(id);refresh(v=>v+1);}} onCancel={()=>edit(false)}/>:
    listing?detail?<Detail data={detail} user={user} busy={busy} back={()=>open('')} edit={()=>edit(true)} transition={async status=>{lock(true);try{await request('/'+listing+'/status',{status});refresh(v=>v+1);}catch(e){notify(e.message);}finally{lock(false);}}}/>:<><p>{error?'':'Loading listing…'}</p><button onClick={()=>open('')}>Back to listings</button></>:
    <>{mine?<button onClick={()=>edit(true)}>Create listing</button>:<><form onSubmit={e=>{e.preventDefault();apply(filters);}}><div className="pair">{filterFields.slice(0,4).map(item=><Field key={item[0]} item={item} values={filters} change={change}/>)}</div>
      <details><summary>All filters and sorting</summary>{filterFields.slice(4).map(item=><Field key={item[0]} item={item} values={filters} change={change}/>)}<Features selected={(filters.amenities||'').split(',').filter(Boolean)} toggle={v=>change('amenities',v.join(','))}/></details><button>Apply filters</button></form>
      <div>{[...filterFields,['amenities','Amenities']].filter(([k])=>url[k]).map(([k,label])=><button key={k} onClick={()=>apply({...url,[k]:''})}>Remove {label.toLowerCase()} · {url[k]}</button>)}</div></>}
      {rows===null?!error&&<p>Loading listings…</p>:rows.length?rows.map(l=><article key={l.id}>{l.cover&&<img src={'/api/photos/listing/'+l.id+'/'+l.cover} alt={l.title} loading="lazy" style={{width:'100%',maxHeight:240,objectFit:'cover'}}/>}<h3>{l.title}</h3><p>{[l.kind,l.area,l.city].filter(Boolean).join(' · ')}</p><p>{price(l)}</p>{mine&&<p>{l.status}</p>}<button onClick={()=>open(l.id)}>{mine?'Manage listing':'View listing'}</button></article>):<p>{mine?'Your listings will appear here.':'No places match these filters.'}</p>}</>}
  </section>;
}
