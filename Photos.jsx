import React,{useEffect,useState} from 'react';

async function request(path,options) {
  const response=await fetch(path,options);
  const data=await response.json();
  if(!response.ok) throw Error(data.error || 'Photos could not be loaded.');
  return data;
}
async function prepare(file) {
  if(file.size>15000000) throw Error('Choose a photo under 15 MB.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw Error('Choose a JPEG, PNG or WebP image.');});
  try {
    const scale=Math.min(1,1440/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));
    if(!jpeg || jpeg.size>1500000) throw Error('Choose a smaller photo.');
    return jpeg;
  } finally {bitmap.close();}
}

export function PhotoGallery({kind,id,editable=false}) {
  if (id==null || id==='') return null;
  return <Gallery key={kind+'/'+id} kind={kind} id={id} editable={editable}/>;
}

function Gallery({kind,id,editable}) {
  const base='/api/photos/'+kind+'/'+encodeURIComponent(id);
  const [rows,setRows]=useState([]), [error,setError]=useState(''), [busy,setBusy]=useState(true);
  const [selected,setSelected]=useState(null);
  useEffect(()=>{
    let live=true;
    request(base).then(data=>{if(live)setRows(data);}).catch(e=>{if(live)setError(e.message);})
      .finally(()=>{if(live)setBusy(false);});
    return ()=>{live=false;};
  },[base]);
  async function change(operation) {
    setBusy(true);setError('');
    try {await operation();}
    catch(e){setError(e.message);}
    try {setRows(await request(base));}
    catch(e){setError(e.message);}
    finally {setBusy(false);}
  }
  function move(from,to) {
    const ids=rows.map(row=>row.id);
    [ids[from],ids[to]]=[ids[to],ids[from]];
    change(()=>request(base+'/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})}));
  }
  if (!editable && !rows.length && !error) return null;
  return <section aria-label={kind==='profile'?'Profile photos':'Listing photos'} className="photo-gallery">
    {editable&&<h3>Photos</h3>}
    {!!rows.length&&<div style={{display:'flex',flexWrap:'wrap',gap:12}}>{rows.map((row,index)=><div key={row.id}>
      <button type="button" aria-label={'View photo '+(index+1)} onClick={()=>setSelected(row.id)} style={{padding:0,overflow:'hidden',display:'block'}}>
        <img src={base+'/'+row.id} alt={(kind==='listing'?'Listing':'Profile')+' photo '+(index+1)} loading="lazy" style={{width:126,height:96,objectFit:'cover',display:'block'}}/>
      </button>
      {editable&&<div style={{display:'flex',gap:3}}>
        <button type="button" disabled={busy||index===0} aria-label={'Move photo '+(index+1)+' earlier'} onClick={()=>move(index,index-1)}>←</button>
        <button type="button" disabled={busy||index===rows.length-1} aria-label={'Move photo '+(index+1)+' later'} onClick={()=>move(index,index+1)}>→</button>
        <button type="button" disabled={busy} aria-label={'Remove photo '+(index+1)} onClick={()=>change(()=>request(base+'/'+row.id+'/remove',{method:'POST'}))}>Remove</button>
      </div>}
    </div>)}</div>}
    {editable&&<label>Add photo ({rows.length}/6)
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||rows.length>=6} onChange={event=>{
        const file=event.target.files?.[0];event.target.value='';
        if(file)change(async()=>request(base,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:await prepare(file)}));
      }}/>
    </label>}
    {error&&<p role="alert">{error}</p>}
    {selected&&<dialog ref={node=>{if(node&&!node.open)node.showModal();}} aria-label="Photo preview" onClose={()=>setSelected(null)} style={{maxWidth:'95vw',maxHeight:'95vh'}}>
      <img src={base+'/'+selected} alt={kind==='profile'?'Profile photo':'Listing photo'} style={{maxWidth:'80vw',maxHeight:'75vh',display:'block'}}/>
      <button type="button" autoFocus onClick={()=>setSelected(null)}>Close</button>
    </dialog>}
  </section>;
}
