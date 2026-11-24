import React,{useState,useEffect} from 'react';
import {HABITS,INTERESTS,PROMPTS} from './people-fields.mjs';
import {PhotoGallery} from './Photos.jsx';
import {Decide} from './Social.jsx';

async function request(path,data,signal){
  const res=await fetch('/api/'+path,{signal,...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
  const result=await res.json();
  if(!res.ok)throw Error(result.error||'Please try again.');
  return result;
}
function useResource(path,version){
  const [state,set]=useState({});
  useEffect(()=>{
    const ctrl=new AbortController();set({});
    request(path,undefined,ctrl.signal).then(data=>{if(!ctrl.signal.aborted)set({data});}).catch(e=>{if(!ctrl.signal.aborted)set({error:e.message});});
    return ()=>ctrl.abort();
  },[path,version]);
  return state;
}
function MemberCard({person:p}){
  const h=p.housing||{},prompts=(p.prompts||[]).filter(i=>i.visible),featured=prompts.find(i=>i.featured);
  return <><PhotoGallery kind="profile" id={p.id}/><h2>{p.name||'Your name'}</h2>
    <p>{[p.city,p.languages].filter(Boolean).join(' · ')}</p>{p.hometown&&<p>From {p.hometown}</p>}
    <p>{p.about}</p>{featured&&<blockquote><strong>{featured.question}</strong><p>{featured.answer}</p></blockquote>}
    <p>{[h.intent==='Team up'?'Looking for a flat together':h.intent,h.state,h.district,h.city,h.area,h.minRent!=null&&h.maxRent!=null&&h.currency+' '+h.minRent+'–'+h.maxRent+' per person / month',h.start&&h.end&&h.start+' to '+h.end,h.stay].filter(Boolean).join(' · ')}</p>
    {p.shared?.length>0&&<p><strong>Shared interests</strong> · {p.shared.join(', ')}</p>}
    <details><summary>More about {p.name}</summary>
      {(p.interests||[]).filter(i=>i.visible).map((i,n)=><p key={n}><strong>{i.tag}</strong> {i.detail}</p>)}
      {prompts.filter(i=>i!==featured).map((i,n)=><p key={n}><strong>{i.question}</strong> {i.answer}</p>)}
      {Object.entries(HABITS).map(([key,[label]])=>{
        const answer=p.habits?.[key],pref=p.preferences?.[key];
        return (answer||pref?.choices?.length>0)&&<p key={key}><strong>{label}</strong> {answer||'Unknown'}{pref?.choices?.length>0&&' · '+pref.priority+' preference for '+pref.choices.join(' or ')}</p>;
      })}
    </details></>;
}
export function PublicMember({id}){
  const {data,error}=useResource('people/'+encodeURIComponent(id));
  if(error)return <p>{error}</p>;
  return data?<article><MemberCard person={data}/></article>:<p>Loading profile…</p>;
}
function Fit({title,result:r}){
  return <details><summary>{title} · {r.score==null?'More answers needed':r.score+'%'} ({r.answered}/{r.applicable} answered)</summary>
    {['agreements','differences','unknowns'].map(k=>r[k].length>0&&<p key={k}><strong>{k[0].toUpperCase()+k.slice(1)}</strong> · {r[k].join(', ')}</p>)}</details>;
}
export function People({user}){
  const [version,reload]=useState(0),[decided,remove]=useState([]),{data,error}=useResource('people',version);
  const [intent,setIntent]=useState('');
  const visible=(data||[]).filter(p=>!decided.includes(p.id)&&(!intent||p.housing?.intent===intent));
  return <section><h1>Find a flatmate</h1>{!user.discoverable?<p>Publish your flatmate profile in My profile to see people with compatible plans.</p>:<>
    <label>Show compatible flatmates<select value={intent} onChange={e=>setIntent(e.target.value)}>
      <option value="">Everyone with compatible plans</option>
      <option value="Team up">People looking for a flat together</option>
      <option value="Have a place">People who have a place</option>
    </select></label><p>When you both like each other, either of you can start a conversation in Inbox.</p>
    {error?<p role="alert">{error} <button onClick={()=>reload(v=>v+1)}>Retry</button></p>:!data?<p>Loading profiles…</p>:!visible.length?<p>No more compatible profiles right now.</p>:visible.map(p=><article key={p.id}><MemberCard person={p}/><Fit title="Fits your preferences" result={p.fit}/><Fit title={'Fits '+p.name+'’s preferences'} result={p.reverseFit}/><Decide person={p} onDecided={id=>remove(v=>[...v,id])}/></article>)}
  </>}</section>;
}
function Field({label,value,onChange,options,as,...props}){
  const shared={value:value??'',onChange:e=>onChange(e.target.value),...props};
  return <label>{label}{options?<select {...shared}><option value="">Choose…</option>{options.map(v=><option key={v}>{v}</option>)}</select>:as==='textarea'?<textarea {...shared}/>:<input {...shared}/>}</label>;
}
function Check({label,value,onChange}){
  return <label><input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked)}/> {label}</label>;
}
const steps=['Introduction','Photos','Housing plans','Life at home','Interests & prompts','Preview'];
export function MemberProfile({user,onSaved,onboarding=false}){
  const [draft,set]=useState(()=>{
    const p=user.profile_draft||user;
    return {...p,housing:p.housing||{},preferences:p.preferences||{},habits:p.habits||{},interests:p.interests?.length?p.interests:(p.hobbies||'').split(',').map(s=>s.trim()).filter(Boolean).map(tag=>({tag,detail:'',visible:true})),prompts:p.prompts||[]};
  });
  const [ideas,setIdeas]=useState([]);
  const [step,go]=useState(0),[status,report]=useState(''),[busy,lock]=useState(false);
  const put=(key,v)=>set(d=>({...d,[key]:v}));
  const nested=(key,field,v)=>set(d=>({...d,[key]:{...d[key],[field]:v}}));
  const item=(key,index,field,v)=>set(d=>({...d,[key]:d[key].map((x,i)=>i===index?{...x,[field]:v}:x)}));
  const drop=(key,index)=>put(key,draft[key].filter((x,i)=>i!==index));
  const field=(key,label,props={})=><Field key={key} label={label} value={draft[key]} onChange={v=>put(key,v)} {...props}/>;
  const housing=(key,label,props={})=><Field key={key} label={label} value={draft.housing[key]} onChange={v=>nested('housing',key,v)} {...props}/>;
  async function save(action){
    lock(true);report('');
    try{
      const {name,about,city,languages,hometown,show_hometown,housing,habits,preferences,interests,prompts,discoverable}=draft;
      await request('member-profile',{action,name,about,city,languages,hometown,show_hometown,housing,habits,preferences,interests,prompts,discoverable});
      if(action==='publish')await onSaved?.();
      report(action==='publish'?'Profile saved.':'Draft saved.');return true;
    }catch(e){report(e.message);}finally{lock(false);}
  }
  return <section><h1>{onboarding?'Complete your profile':'My profile'}</h1>{onboarding && <p>Add your name and housing plans to find places within your budget. Photos, personal details and flatmate visibility are optional.</p>}<nav aria-label="Profile sections">{steps.map((s,i)=><button key={s} aria-current={step===i?'step':undefined} onClick={()=>go(i)}>{s}</button>)}</nav>
    <article><h2>{steps[step]}</h2>
    {step===0&&<>{field('name','Display name',{maxLength:80})}{field('city','Current city',{maxLength:100})}{field('hometown','Hometown',{maxLength:100})}<Check label="Show hometown on my profile" value={draft.show_hometown} onChange={v=>put('show_hometown',v)}/>{field('languages','Languages',{maxLength:180})}{field('about','About me',{as:'textarea',maxLength:600})}</>}
    {step===1&&<PhotoGallery kind="profile" id={user.id} editable/>}
    {step===2&&<><p>Choose Team up to find someone to rent a flat with. You can join before either of you has a listing.</p>{housing('intent','Housing intention',{options:['Team up','Have a place']})}{housing('state','Target state or union territory',{maxLength:100})}{housing('district','Target district',{maxLength:100})}{housing('city','Target city',{maxLength:100})}{housing('area','Target neighbourhoods (separate with commas)',{maxLength:320})}{housing('currency','Budget currency (three-letter code)',{maxLength:3})}{housing('minRent','Minimum monthly budget per person',{type:'number',min:0})}{housing('maxRent','Maximum monthly budget per person',{type:'number',min:0})}{housing('kind','Preferred space',{options:['Whole flat','Private room','Shared room']})}{housing('start','Earliest move date',{type:'date'})}{housing('end','Latest move date',{type:'date'})}{housing('stay','Intended length of stay',{maxLength:80})}</>}
    {step===3&&Object.entries(HABITS).map(([k,[label,...options]])=>{
      const pref=draft.preferences[k]||{priority:'none',choices:[]};
      return <fieldset key={k}><legend>{label}</legend><Field label="My answer" options={options} value={draft.habits[k]} onChange={v=>nested('habits',k,v)}/>
        <Field label="What I need in a flatmate" options={['none','required','important','flexible']} value={pref.priority} onChange={v=>nested('preferences',k,{...pref,priority:v||'none'})}/>
        {pref.priority!=='none'&&options.map(v=><Check key={v} label={v} value={pref.choices.includes(v)} onChange={on=>nested('preferences',k,{...pref,choices:on?[...pref.choices,v]:pref.choices.filter(s=>s!==v)})}/>)}</fieldset>;
    })}
    {step===4&&<><h3>Hobbies</h3><datalist id="interest-tags">{INTERESTS.map(v=><option key={v} value={v}/>)}</datalist>
      {draft.interests.map((i,n)=><fieldset key={n}><Field label="Interest tag" list="interest-tags" maxLength={48} value={i.tag} onChange={v=>item('interests',n,'tag',v)}/><Field label="What do you enjoy about it?" value={i.detail} maxLength={240} onChange={v=>item('interests',n,'detail',v)}/><Check label="Show this interest" value={i.visible} onChange={v=>item('interests',n,'visible',v)}/><button onClick={()=>drop('interests',n)}>Remove interest</button></fieldset>)}
      {draft.interests.length<15&&<button onClick={()=>put('interests',[...draft.interests,{tag:'',detail:'',visible:true}])}>Add interest</button>}<h3>Conversation prompts</h3><button onClick={async()=>{
        try{const result=await request('profile-prompts');setIdeas(result.prompts.filter(p=>PROMPTS.includes(p)));}catch(e){report(e.message);}
      }}>Get introduction ideas</button>
      {ideas.length>0&&draft.prompts.length<3&&<ul>{ideas.map(q=><li key={q}><button onClick={()=>put('prompts',[...draft.prompts,{question:q,answer:'',visible:true,featured:false}])}>{q}</button></li>)}</ul>}
      {draft.prompts.map((i,n)=><fieldset key={n}><Field label="Prompt" options={PROMPTS} value={i.question} onChange={v=>item('prompts',n,'question',v)}/><Field label="Your answer" as="textarea" maxLength={350} value={i.answer} onChange={v=>item('prompts',n,'answer',v)}/><Check label="Show this answer" value={i.visible} onChange={v=>item('prompts',n,'visible',v)}/><Check label="Feature on discovery card" value={i.featured} onChange={v=>put('prompts',draft.prompts.map((x,idx)=>({...x,featured:idx===n&&v})))}/><button onClick={()=>drop('prompts',n)}>Remove prompt</button></fieldset>)}
      {draft.prompts.length<3&&<button onClick={()=>put('prompts',[...draft.prompts,{question:PROMPTS[0],answer:'',visible:true,featured:false}])}>Add prompt</button>}</>}
    {step===5&&<><MemberCard person={{...draft,id:user.id,hometown:draft.show_hometown?draft.hometown:''}}/><Check label="Show me in flatmate discovery" value={draft.discoverable} onChange={v=>put('discoverable',v)}/></>}
    </article><button disabled={busy} onClick={()=>save('draft')}>Save draft</button>{step<5?<button disabled={busy} onClick={async()=>{if(!onboarding || await save('draft'))go(s=>s+1);}}>Continue</button>:<button disabled={busy} onClick={()=>save('publish')}>{onboarding?'Finish and find matches':'Save profile and visibility'}</button>}<p role="status">{status}</p></section>;
}
