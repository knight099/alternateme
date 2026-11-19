import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';

async function api(path, data) {
  const options = data === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)
  };
  const response = await fetch('/api/'+path,options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

function Input({label,...props}) {
  return <label>{label}<input {...props}/></label>;
}

function Auth({submit}) {
  const [register,setRegister] = useState(false);
  return <><h1>Find your place.<br/>Meet your flatmates.</h1>
    <form onSubmit={submit(register?'register':'login')}>
      <h2>{register?'Create account':'Sign in'}</h2>
      {register && <Input label="Display name" name="name" required maxLength={80}/>}
      <Input label="Email" name="email" type="email" autoComplete="email" required/>
      <Input label="Password" name="password" type="password" autoComplete={register?'new-password':'current-password'} minLength={8} maxLength={256} required/>
      <button>{register?'Create account':'Sign in'}</button>
      <button type="button" onClick={()=>setRegister(!register)}>{register?'Use existing account':'Create an account'}</button>
    </form></>;
}

function Profile({user,submit}) {
  return <><h1>My profile</h1><form onSubmit={submit('profile')}>
    <Input label="Display name" name="name" defaultValue={user.name} maxLength={80} required/>
    <label>About me<textarea name="about" defaultValue={user.about} maxLength={600}/></label>
    <Input label="Hometown" name="hometown" defaultValue={user.hometown} maxLength={100}/>
    <Input label="Hobbies" name="hobbies" defaultValue={user.hobbies} maxLength={200}/>
    <label><input type="checkbox" name="discoverable" defaultChecked={!!user.discoverable}/> Show me in flatmate search</label>
    <button>Save profile</button>
  </form></>;
}

const kinds = ['Whole flat','Private room','Shared room'];
function FlatCard({flat}) {
  return <article><h3>{flat.title}</h3><p>{flat.kind} · {flat.area} · {flat.currency} {flat.rent} / month · {flat.name}</p></article>;
}

function Post({flats,submit}) {
  return <><h1>Post a place</h1><form onSubmit={submit('flats')}>
    <Input label="Listing title" name="title" required maxLength={100}/>
    <Input label="Area or city" name="area" required maxLength={100}/>
    <label>Offer type<select name="kind">{kinds.map(k=><option key={k}>{k}</option>)}</select></label>
    <div className="pair"><Input label="Monthly rent" name="rent" required type="number" min={1} step={1}/>
    <Input label="Currency code" name="currency" required pattern="[A-Z]{3}" maxLength={3} placeholder="e.g. INR"/></div>
    <button>Publish listing</button></form><h2>Your listings</h2>
    {flats.length?flats.map(f=><FlatCard key={f.id} flat={f}/>):<p>Your published listings will appear here.</p>}</>;
}

function Search({flats,people}) {
  const [target,setTarget]=useState('flats');
  const [query,setQuery]=useState('');
  const [kind,setKind]=useState('');
  const housing=target==='flats';
  const matches = (housing?flats:people).filter(row=>{
    const fields=housing?[row.title,row.area,row.kind,row.name,row.currency,String(row.rent)]:[row.name,row.hometown,row.about,row.hobbies];
    return (!housing || !kind || row.kind===kind) && fields.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  });
  return <><h1>Discover</h1><label>Looking for<select value={target} onChange={e=>{setTarget(e.target.value);setQuery('');}}>
    <option value="flats">Flats and rooms</option><option value="people">Flatmates</option></select></label>
    {housing && <label>Offer type<select value={kind} onChange={e=>setKind(e.target.value)}><option value="">All types</option>{kinds.map(k=><option key={k}>{k}</option>)}</select></label>}
    <Input label="Search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={housing?'Area, room type or listing title':'Name, hometown or hobby'}/>
    {matches.map(row=>housing?<FlatCard key={row.id} flat={row}/>:<article key={row.id}><h3>{row.name}</h3><p>{[row.hometown,row.hobbies,row.about].filter(Boolean).join(' · ')}</p></article>)}
    {!matches.length && <p>{housing?'No matching flats or rooms.':'No matching flatmates.'}</p>}</>;
}

function App() {
  const [user,setUser]=useState(undefined);
  const [flats,setFlats]=useState([]);
  const [people,setPeople]=useState([]);
  const [page,setPage]=useState('search');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  async function refresh() {
    const account=await api('me');
    if (account) {
      const [listings,profiles]=await Promise.all([api('flats'),api('flatmates')]);
      setFlats(listings);setPeople(profiles);setPage(account.mode);
    }
    setUser(account);
  }
  useEffect(()=>{refresh().catch(e=>setStatus(e.message));},[]);
  async function save(path,data,form) {
    if (busy) return;
    setBusy(true);setStatus('');
    try {
      await api(path,data);
      if (path==='flats') form.reset();
      await refresh();
      if(path==='profile') setStatus('Profile saved.');
      if(path==='flats') setStatus('Listing published.');
    } catch(error) {setStatus(error.message);}
    finally {setBusy(false);}
  }
  const submit=path=>event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const values=Object.fromEntries(new FormData(form));
    if(path==='profile') values.discoverable=form.elements.discoverable.checked;
    save(path,values,form);
  };
  return <><header><b>AlternateMe</b>{user && <nav><button disabled={busy} onClick={()=>setPage('profile')}>My profile</button><button disabled={busy} onClick={()=>save('logout',{})}>Sign out</button></nav>}</header>
    <main><fieldset disabled={busy}>
    {user===undefined?<p>Loading account…</p>:!user?<Auth submit={submit}/>:<>
      <div role="group" aria-label="Account mode">{['search','post'].map(mode=><button aria-pressed={page===mode} key={mode} onClick={()=>save('mode',{mode})}>{mode==='search'?'Search':'Post'}</button>)}</div>
      <section hidden={page!=='search'}><Search flats={flats} people={people}/></section>
      <section hidden={page!=='post'}><Post flats={flats.filter(f=>f.owner===user.id)} submit={submit}/></section>
      {page==='profile' && <Profile user={user} submit={submit}/>}
    </>}</fieldset><p role="status">{status}</p></main></>;
}

createRoot(document.getElementById('root')).render(<App/>);
