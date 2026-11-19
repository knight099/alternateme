import React,{useEffect,useRef,useState} from 'react';

async function call(path,data,signal) {
  const response=await fetch('/api/'+path,{signal,...(data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})});
  const result=await response.json();
  if(!response.ok) throw Error(result.error || 'Please try again.');
  return result;
}
function useAction() {
  const lock=useRef(false);
  const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
  async function run(work) {
    if(lock.current) return;
    lock.current=true;setBusy(true);setStatus('');
    try {await work();} catch(e) {setStatus(e.message);}
    finally {lock.current=false;setBusy(false);}
  }
  return {busy,status,setStatus,run};
}
function Safety({target,onBlock,context}) {
  const [mode,select]=useState(''),[reason,setReason]=useState('');
  const {busy,status,setStatus,run}=useAction();
  return <details><summary>Safety options</summary>
    <button type="button" onClick={()=>select('report')}>Report member</button>
    <button type="button" onClick={()=>select('block')}>Block member</button>
    {mode==='report' && <div><label>What happened?<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>
      <button type="button" disabled={busy||!reason.trim()} onClick={()=>run(async()=>{
        await call('reports',{target,reason,context});setReason('');select('');setStatus('Report submitted.');
      })}>Submit report</button></div>}
    {mode==='block' && <div><p>Blocking hides this member and ends contact.</p>
      <button type="button" disabled={busy} onClick={()=>run(async()=>{await call('blocks',{target});onBlock();})}>Confirm block</button>
      <button type="button" onClick={()=>select('')}>Cancel</button></div>}
    <span role="status">{status}</span></details>;
}
export function Decide({person,onDecided}) {
  const {busy,status,setStatus,run}=useAction();
  const [done,setDone]=useState(false);
  function finish(message) {setDone(true);setStatus(message);onDecided?.(person.id);}
  const ref=useRef(null),voteRef=useRef(null);
  voteRef.current=vote=>{if(!done)run(async()=>{
    const row=await call('decisions',{target:person.id,vote});finish(row.connected?'You matched! Open your inbox.':vote==='like'?'Like sent.':'Passed.');
  });};
  useEffect(()=>{
    const card=ref.current?.closest('article')||ref.current;
    if(!card)return;
    let start;
    const down=e=>{start=e.touches.length===1?[e.touches[0].clientX,e.touches[0].clientY]:null;};
    const up=e=>{if(!start)return;const touch=e.changedTouches[0],dx=touch.clientX-start[0],dy=touch.clientY-start[1];start=null;
      if(Math.abs(dx)>90&&Math.abs(dx)>2*Math.abs(dy))voteRef.current(dx>0?'like':'pass');};
    card.addEventListener('touchstart',down,{passive:true});card.addEventListener('touchend',up,{passive:true});
    return ()=>{card.removeEventListener('touchstart',down);card.removeEventListener('touchend',up);};
  },[]);
  return <div ref={ref}>{!done && <>{['pass','like'].map(vote=><button type="button" disabled={busy} key={vote} onClick={()=>voteRef.current(vote)}>{vote==='like'?'Like':'Pass'}</button>)}<Safety target={person.id} onBlock={()=>finish('Member blocked.')}/></>}
    <span role="status">{status}</span></div>;
}
export function Contact({listing,user}) {
  const {busy,status,setStatus,run}=useAction();
  const [done,setDone]=useState(false),[blocked,setBlocked]=useState(false);
  const [question,setQuestion]=useState('');
  if(listing.owner===user?.id) return null;
  return <div>{!blocked && <><label>Question for the poster<textarea maxLength={2000} disabled={done} value={question} onChange={e=>setQuestion(e.target.value)}/></label><button type="button" disabled={busy||done||!question.trim()} onClick={()=>run(async()=>{
    const row=await call('requests',{listing:Number(listing.id),question});setDone(true);
    setStatus(row.state==='closed'?'This request is closed.':row.state==='open'?'Open your inbox to chat.':row.requester===user?.id?'Request sent.':'You have a request from this member in your inbox.');
  })}>Request to chat</button><Safety context={'listing:'+listing.id} target={listing.owner} onBlock={()=>{setBlocked(true);setStatus('Member blocked.');}}/></>}
    <span role="status">{status}</span></div>;
}
function Chat({thread,user}) {
  const [messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[older,setOlder]=useState(false);
  const [version,reload]=useState(0),[readError,setReadError]=useState('');
  const retry=useRef(null);
  const {busy,status,run}=useAction();
  useEffect(()=>{
    const controller=new AbortController();
    let source;
    async function subscribe(){
      try {
        const rows=await call('threads/'+thread.id+'/messages',undefined,controller.signal);
        if(controller.signal.aborted)return;
        setMessages(previous=>[...previous.filter(m=>rows[0]&&BigInt(m.id)<BigInt(rows[0].id)),...rows]);
        setOlder(rows.length===100);setReadError('');
        source=new EventSource('/api/threads/'+thread.id+'/events?after='+(rows.at(-1)?.id||'0'));
        source.onmessage=e=>{const message=JSON.parse(e.data);setReadError('');setMessages(existing=>
          existing.some(m=>m.id===message.id)?existing:[...existing,message]);};
        source.addEventListener('closed',()=>{source.close();setMessages([]);setReadError('Conversation closed.');});
        source.onerror=()=>setReadError('Reconnecting to chat…');
      }catch(e){if(!controller.signal.aborted){setMessages([]);setReadError(e.message);}}
    }
    subscribe();return ()=>{controller.abort();source?.close();};
  },[thread.id,version]);
  return <section><h3>Chat with {thread.name}</h3>
    {older && messages.length>0 && <button type="button" disabled={busy} onClick={()=>run(async()=>{
      const rows=await call('threads/'+thread.id+'/messages?before='+messages[0].id);
      setOlder(rows.length===100);setMessages(previous=>[...rows,...previous]);
    })}>Earlier messages</button>}
    {thread.question && <p><b>Listing enquiry</b> {thread.question}</p>}
    {thread.shared.map(tag=><button type="button" key={tag} onClick={()=>setDraft(tag.toLowerCase()==='cooking'?'What have you been cooking lately?':'What got you into '+tag.toLowerCase()+'?')}>{tag}</button>)}
    <ol>{messages.map(m=><li key={m.id}><b>{m.sender===user.id?'You':thread.name}</b> {m.body}{m.sender!==user.id && <Safety context={'message:'+m.id} target={m.sender} onBlock={()=>reload(n=>n+1)}/>}</li>)}</ol>
    <form onSubmit={e=>{e.preventDefault();run(async()=>{
      const body=draft.trim();if(!body) return;
      if(retry.current?.body!==body) retry.current={body,token:crypto.randomUUID()};
      await call('threads/'+thread.id+'/messages',retry.current);retry.current=null;setDraft('');reload(n=>n+1);
    });}}><label>Message<textarea required maxLength={2000} disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)}/></label>
      <button disabled={busy||!draft.trim()}>Send</button></form><span role="status">{readError||status}</span></section>;
}
function Moderation(){
  const [allowed,allow]=useState(false),[rows,setRows]=useState(null);
  const {busy,status,run}=useAction();
  useEffect(()=>{call('moderation/access').then(r=>allow(r.allowed)).catch(()=>{});},[]);
  if(!allowed)return null;
  return <section><h2>Report review</h2><button type="button" disabled={busy} onClick={()=>run(async()=>setRows(await call('moderation/reports')))}>Load review queue</button>
    {rows?.length===0&&<p>No reports awaiting review.</p>}{rows?.map(r=><article key={r.id}><h3>{r.name}</h3><p>{r.context} · {r.reason}</p>
    <button type="button" disabled={busy} onClick={()=>run(async()=>{await call('moderation/reports/'+r.id+'/review',{});setRows(current=>current.filter(item=>item.id!==r.id));})}>Mark reviewed</button></article>)}
    <p role="status">{status}</p></section>;
}
function Fit({label,value}){
  return <details><summary>{label} · {value.needsConfirmation.length?'Needs confirmation':value.conflicts.length?'Required condition conflicts':value.score==null?'More answers needed':value.score+'%'}</summary>
    <p>{value.answered} of {value.applicable} optional preferences answered</p>
    {['agreements','differences','unknowns','conflicts','needsConfirmation'].filter(key=>value[key].length).map(key=><p key={key}>{key==='needsConfirmation'?'Needs confirmation':key} · {value[key].join(', ')}</p>)}</details>;
}
export function Inbox({user}) {
  const [threads,setThreads]=useState(null),[selected,select]=useState(null),[version,reload]=useState(0),[error,setError]=useState('');
  const {busy,status,run}=useAction();
  useEffect(()=>{
    const controller=new AbortController();
    call('inbox',undefined,controller.signal).then(rows=>{if(!controller.signal.aborted){setThreads(rows);setError('');}})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[version]);
  const thread=threads?.find(t=>t.id===selected && t.connected);
  return <section><h1>Inbox</h1><button type="button" onClick={()=>reload(n=>n+1)}>Refresh inbox</button>
    {threads===null&&!error&&<p>Loading inbox…</p>}{threads?.length===0&&<p>Your matches and chat requests will appear here.</p>}
    {threads?.map(t=><article key={t.id}><h3>{t.name}</h3><p>{t.title||'Flatmate match'}{t.title&&t.listing_status!=='open'?' · Closed to new enquiries':''}</p>
      {t.question&&<p>{t.question}</p>}{t.fit&&<><Fit label="Fits your search (seeker)" value={t.fit.seeker}/><Fit label="Fits the household’s preferences" value={t.fit.household}/></>}
      {!t.requester && <button type="button" disabled={busy} onClick={()=>run(async()=>{
        await call('threads/'+t.id+'/unmatch',{});setThreads(previous=>previous.filter(row=>row.id!==t.id));
      })}>Unmatch</button>}
      {t.connected?<button type="button" onClick={()=>select(t.id)}>Open chat</button>:t.requester===user.id?<p>Request sent</p>:<>
        <p>Wants to chat</p>{[true,false].map(accept=><button type="button" key={String(accept)} disabled={busy} onClick={()=>run(async()=>{
          await call('threads/'+t.id+'/respond',{accept});reload(n=>n+1);if(accept) select(t.id);
        })}>{accept?'Accept':'Decline'}</button>)}</>}
      <Safety target={t.peer} onBlock={()=>setThreads(previous=>previous.filter(row=>row.id!==t.id))}/></article>)}
    <span role="status">{error||status}</span>{thread&&<Chat key={thread.id} thread={thread} user={user}/>}<Moderation/></section>;
}
