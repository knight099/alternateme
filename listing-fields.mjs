export const fields = [
  ['title','Listing title','text',100],['city','City','text',100],['area','Neighbourhood','text',100],
  ['kind','Offer type',['Whole flat','Private room','Shared room']],['currency','Currency code','currency'],
  ['rent','Monthly rent for this offer','money'],['available','Available from','date'],
  ['description','About the place','long',1600],['deposit','Deposit','money'],['maintenance','Monthly maintenance','money'],
  ['utilities','Utilities',['Included','Extra']],['utilityCost','Monthly utility cost','money'],['brokerage','Brokerage fee','money'],
  ['bedrooms','Bedrooms','count'],['bathrooms','Bathrooms','count'],['privateBath','Private bathroom',['Yes','No']],
  ['occupancy','Maximum occupants','count'],['stay','Minimum stay in months','count'],['lease','Lease type',['Fixed term','Rolling','Sublet']],
  ['furnishing','Furnishing',['Furnished','Semi-furnished','Unfurnished']],['pets','Pets',['Allowed','By agreement','No pets']],
  ['smoking','Indoor smoking',['Allowed','Smoke-free']],['size','Existing household size','count'],
  ['role','Poster role',['Live-in flatmate','Nonresident owner','Agent']],['household','About the household','long',1000],
  ['state','State or union territory','text',100],['district','District','text',100],
  ['latitude','Approximate latitude','lat'],['longitude','Approximate longitude','lon']
];
export const amenities = ['Parking','Lift','Step-free access','Laundry','Air conditioning','Internet'];
export const required = ['title','city','area','kind','currency','rent','available'];
export function matches(row,q){
  const lower=v=>String(v||'').trim().toLowerCase();
  const list=v=>String(v||'').split(',').map(lower).filter(Boolean);
  const exact=['state','district','currency','kind','utilities','privateBath','lease','furnishing','pets','smoking'];
  if(exact.some(k=>q[k] && lower(q[k])!==lower(row[k]))) return false;
  if(q.city && lower(row.city)!==lower(q.city)) return false;
  if(q.area && !list(q.area).includes(lower(row.area))) return false;
  if(q.keyword && !lower([row.title,row.description,row.area,row.city].join(' ')).includes(lower(q.keyword))) return false;
  const bounds=[['minRent','rent',1],['maxRent','rent',-1],['maxDeposit','deposit',-1],['bedrooms','bedrooms',1],['occupancy','occupancy',1],['stay','stay',-1],['size','size',-1]];
  if(bounds.some(([k,f,dir])=>q[k] && (row[f]==null || (Number(row[f])-Number(q[k]))*dir<0))) return false;
  if(q.noBrokerage && Number(row.brokerage??-1)!==0) return false;
  if(q.move && (!row.available || row.available>q.move)) return false;
  if(q.radius){
    if([row.latitude,row.longitude,q.lat,q.lon].some(v=>v==null||v==='')) return false;
    const rad=n=>Number(n)*Math.PI/180;
    const a=Math.sin(rad(row.latitude-q.lat)/2)**2+Math.cos(rad(q.lat))*Math.cos(rad(row.latitude))*Math.sin(rad(row.longitude-q.lon)/2)**2;
    if(12742*Math.asin(Math.sqrt(Math.min(1,a)))>Number(q.radius)) return false;
  }
  return list(q.amenities).every(item=>(row.amenities||[]).some(a=>lower(a)===item));
}
