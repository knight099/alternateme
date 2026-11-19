const el = id => document.getElementById(id);
let user, registering = false, flats = [], people = [];
async function api(path, data) {
  const response = await fetch('/api/'+path,data === undefined ? {} : {
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
function on(id,event,handler) {
  el(id).addEventListener(event,async e => {
    e.preventDefault();
    el('status').textContent = '';
    try { await handler(e); } catch(error) { el('status').textContent = error.message; }
  });
}
function cardList(id,rows,empty) {
  const root = el(id);
  root.replaceChildren();
  if (!rows.length) root.textContent = empty;
  for (const [title,details] of rows) {
    const card = document.createElement('article');
    const heading = document.createElement('h3');
    const body = document.createElement('p');
    heading.textContent = title;
    body.textContent = details;
    card.append(heading,body);
    root.append(card);
  }
}
function flatCard(f) { return [f.title,[f.kind,f.area,f.currency+' '+f.rent+' / month',f.name].join(' · ')]; }
function results() {
  const isFlat = el('target').value === 'flats';
  el('query').placeholder = isFlat ? 'Area, room type or listing title' : 'Name, hometown or hobby';
  const term = el('query').value.trim().toLowerCase();
  const rows = isFlat ? flats.map(flatCard) : people.map(p => [p.name,[p.hometown,p.hobbies,p.about].filter(Boolean).join(' · ')]);
  cardList('results',rows.filter(row => row.join(' ').toLowerCase().includes(term)),isFlat?'No matching flats or rooms.':'No matching flatmates.');
  cardList('own',flats.filter(f=>f.owner===user.id).map(flatCard),'Your published listings will appear here.');
}
function view(page) {
  for (const id of ['search','post','profile']) el(id).hidden = page !== id;
  for (const id of ['search','post']) el(id+'Button').setAttribute('aria-pressed',String(page===id));
}
async function refresh() {
  user = await api('me');
  el('auth').hidden = !!user;
  el('account').hidden = el('home').hidden = !user;
  if (!user) return;
  [flats,people] = await Promise.all([api('flats'),api('flatmates')]);
  for (const name of ['name','about','hometown','hobbies']) el('bio').elements[name].value = user[name];
  el('bio').elements.discoverable.checked = !!user.discoverable;
  view(user.mode);
  results();
}
on('toggleAuth','click',() => {
  registering = !registering;
  el('nameLabel').hidden = !registering;
  el('credentials').elements.name.required = registering;
  el('credentials').elements.password.autocomplete = registering?'new-password':'current-password';
  el('submitAuth').textContent = el('authTitle').textContent = registering?'Create account':'Sign in';
  el('toggleAuth').textContent = registering?'Use existing account':'Create an account';
});
const values = form => Object.fromEntries(new FormData(form));
on('credentials','submit',async e => {
  await api(registering?'register':'login',values(e.target));
  e.target.reset();
  await refresh();
});
for (const mode of ['search','post']) on(mode+'Button','click',async () => {
  await api('mode',{mode});
  await refresh();
});
on('profileButton','click',()=>view('profile'));
on('logout','click',async()=>{ await api('logout',{}); location.reload(); });
on('bio','submit',async e=>{
  await api('profile',{...values(e.target),discoverable:e.target.elements.discoverable.checked});
  await refresh();
  el('status').textContent='Profile saved.';
});
on('listing','submit',async e=>{
  await api('flats',values(e.target));
  e.target.reset();
  await refresh();
  el('status').textContent='Listing published.';
});
on('target','change',()=>{ el('query').value=''; results(); });
on('query','input',results);
refresh().catch(error=>{ el('status').textContent=error.message; });
