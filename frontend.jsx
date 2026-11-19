import React,{useCallback,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Welcome} from './Welcome.jsx';
import {Listings} from './Listings.jsx';
import {People,MemberProfile} from './People.jsx';
import {Inbox} from './Social.jsx';

async function request(path,body) {
  const response=await fetch('/api/'+path,body===undefined?{}:{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  const result=await response.json();
  if(!response.ok) throw Error(result.error || 'Request failed. Try again.');
  return result;
}

function Account({onDeleted}) {
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  async function remove(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data=Object.fromEntries(new FormData(event.currentTarget));
      const result=await request('account/delete',data);
      if(result.deleted) onDeleted();
      else setMessage(result.message);
    } catch(e) {setMessage(e.message);} finally {setBusy(false);}
  }
  return <details><summary>Delete my account</summary><form onSubmit={remove}>
    <p>Deletion removes your profile, listings, gallery and conversations. This is permanent.</p>
    <label>Current password<input type="password" autoComplete="current-password" name="password" required/></label>
    <label>Type DELETE to confirm<input name="confirmation" pattern="DELETE" required/></label>
    <button disabled={busy}>Permanently delete my account</button><p role="status">{message}</p>
  </form></details>;
}

function App() {
  const [user,setUser]=useState(undefined);
  const [page,setPage]=useState('search');
  const [search,setSearch]=useState('recommended');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    const account=await request('me');
    setUser(account);
    return account;
  },[]);
  const start=useCallback(async()=>{
    try {const account=await refresh();setPage(account?.mode || 'search');setStatus('');}
    catch(error){setStatus(error.message);}
  },[refresh]);
  useEffect(()=>{start();},[start]);
  async function changeMode(mode) {
    if(busy) return;
    setBusy(true);
    try {await request('mode',{mode});setPage(mode);setStatus('');}
    catch(e){setStatus(e.message);} finally{setBusy(false);}
  }
  async function logout() {
    try {await request('logout',{});setUser(null);setStatus('');setSearch('recommended');}
    catch(error){setStatus(error.message);}
  }
  const submit=path=>async event=>{
    event.preventDefault();
    if(busy) return;
    const values=Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);setStatus('');
    try {
      const result=await request(path,values);
      if(result.verificationRequired) return result;
      const account=await refresh();
      if(account) setPage(account.mode);
      return {verificationRequired:path==='register' && !account};
    } catch(e){setStatus(e.message);} finally{setBusy(false);}
  };
  return <><header><b>AlternateMe</b>{user && <nav aria-label="Account">
    {user.profileComplete && <><button aria-pressed={page==='inbox'} onClick={()=>setPage('inbox')}>Inbox</button>
    <button aria-pressed={page==='profile'} onClick={()=>setPage('profile')}>My profile</button></>}
    <button onClick={logout}>Sign out</button></nav>}</header>
    <main>{user===undefined?(status?<button onClick={start}>Retry connection</button>:<p>Loading account…</p>):
      !user?<fieldset disabled={busy}><Welcome submit={submit}/></fieldset>:!user.profileComplete?<MemberProfile user={user} onboarding onSaved={async()=>{await refresh();setPage('search');setSearch('recommended');}}/>:<>
        <div role="group" aria-label="Account mode">{['search','post'].map(mode=><button key={mode}
          disabled={busy} aria-pressed={page===mode} onClick={()=>changeMode(mode)}>{mode==='search'?'Search':'Post'}</button>)}</div>
        {page==='search' && <><nav aria-label="Search category"><button aria-pressed={search==='recommended'} onClick={()=>setSearch('recommended')}>For you</button><button aria-pressed={search==='flats'} onClick={()=>setSearch('flats')}>Flats and rooms</button>
          <button aria-pressed={search==='people'} onClick={()=>setSearch('people')}>Flatmates</button></nav>
          {search==='recommended'?<><Listings key="suggested" user={user} mode="recommended"/>{user.discoverable && <People user={user}/>}</>:search==='people'?<People user={user}/>:<Listings user={user} mode="search"/>}</>}
        {page==='post' && <Listings user={user} mode="post"/>}
        {page==='profile' && <><MemberProfile user={user} onSaved={refresh}/><Account onDeleted={()=>{setUser(null);setStatus('Account deleted.');}}/></>}
        {page==='inbox' && <Inbox user={user}/>}
      </>}<p role="status">{status}</p></main></>;
}
createRoot(document.getElementById('root')).render(<App/>);
