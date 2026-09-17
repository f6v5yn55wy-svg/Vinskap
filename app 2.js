const $ = (id) => document.getElementById(id);
const DB_NAME = 'vinskap-db';
const DB_VERSION = 1;
let db;

function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const d=req.result;
      if(!d.objectStoreNames.contains('wines')) d.createObjectStore('wines',{keyPath:'id'});
      if(!d.objectStoreNames.contains('trips')) d.createObjectStore('trips',{keyPath:'id'});
    };
    req.onsuccess=()=>{db=req.result;resolve(db)};
    req.onerror=()=>reject(req.error);
  });
}
function store(name,mode='readonly'){return db.transaction(name,mode).objectStore(name)}
function getAll(name){return new Promise((r,j)=>{const q=store(name).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)})}
function put(name,val){return new Promise((r,j)=>{const q=store(name,'readwrite').put(val);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}
function del(name,id){return new Promise((r,j)=>{const q=store(name,'readwrite').delete(id);q.onsuccess=()=>r();q.onerror=()=>j(q.error)})}

function openModal(id){$(id).classList.add('open');$(id).setAttribute('aria-hidden','false')}
function closeModal(id){$(id).classList.remove('open');$(id).setAttribute('aria-hidden','true')}
function safe(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function money(n){return new Intl.NumberFormat('nb-NO',{style:'currency',currency:'NOK',maximumFractionDigits:0}).format(Number(n)||0)}
function uid(){return crypto.randomUUID ? crypto.randomUUID() : Date.now()+'-'+Math.random()}
function typeToZone(type){return type==='Rødvin' || type==='Portvin' ? 'red' : 'white'}

async function render(){
  const wines=await getAll('wines');
  const trips=await getAll('trips');
  const total=wines.reduce((s,w)=>s+(Number(w.quantity)||0),0);
  const val=wines.reduce((s,w)=>s+(Number(w.quantity)||0)*(Number(w.price)||0),0);
  $('totalBottles').textContent=total;
  $('totalValue').textContent=money(val);
  $('whiteCount').textContent=wines.filter(w=>typeToZone(w.type)==='white').reduce((s,w)=>s+(Number(w.quantity)||0),0);
  $('redCount').textContent=wines.filter(w=>typeToZone(w.type)==='red').reduce((s,w)=>s+(Number(w.quantity)||0),0);

  const recent=[...wines].sort((a,b)=>b.createdAt-a.createdAt).slice(0,3);
  $('recentWines').classList.toggle('empty',!recent.length);
  $('recentWines').innerHTML=recent.length?recent.map(w=>wineCard(w,false)).join(''):'Ingen viner registrert ennå. Legg til den første flasken.';
  renderWineList(wines);
  $('tripList').innerHTML=trips.length?[...trips].sort((a,b)=>b.createdAt-a.createdAt).map(tripCard).join(''):'<div class="card empty">Ingen turer lagret ennå.</div>';
  bindDynamic();
}
function wineCard(w,actions=true){
  return `<article class="wine-card"><div class="row"><div><h3>${safe(w.name)}</h3><p>${safe(w.producer||'')}${w.vintage?' · '+safe(w.vintage):''}</p></div><strong>${safe(w.quantity||1)} stk</strong></div><span class="badge">${safe(w.type)}</span><p>${safe([w.country,w.region].filter(Boolean).join(' · '))}</p><p>${w.price?money(w.price):''}</p>${w.barcode?`<p class="source">Strekkode: ${safe(w.barcode)}</p>`:''}${actions?`<div class="actions"><button class="edit" data-edit="${w.id}">Rediger</button><button class="delete" data-delete="${w.id}">Slett</button></div>`:''}</article>`
}
function tripCard(t){return `<article class="trip-card">${t.image?`<img class="trip-image" src="${t.image}" alt="${safe(t.name)}">`:''}<h3>${safe(t.name)}</h3><p>${safe(t.text||'')}</p><div class="actions"><button class="delete" data-trip-delete="${t.id}">Slett</button></div></article>`}
function renderWineList(wines){
  const q=($('wineSearch').value||'').toLowerCase();
  const type=$('wineTypeFilter').value;
  const list=wines.filter(w=>(!type||w.type===type)&&(!q||JSON.stringify(w).toLowerCase().includes(q))).sort((a,b)=>b.createdAt-a.createdAt);
  $('wineList').innerHTML=list.length?list.map(w=>wineCard(w,true)).join(''):'<div class="card empty">Ingen viner matcher søket.</div>';
}
function bindDynamic(){
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Slette denne vinen?')){await del('wines',b.dataset.delete);render()}});
  document.querySelectorAll('[data-trip-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Slette denne turen?')){await del('trips',b.dataset.tripDelete);render()}});
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editWine(b.dataset.edit));
}
async function editWine(id){
  const wines=await getAll('wines'); const w=wines.find(x=>x.id===id); if(!w)return;
  resetWineForm(); Object.entries(w).forEach(([k,v])=>{if($(k))$(k).value=v??''}); $('wineId').value=w.id; openModal('wineModal');
}
function resetWineForm(){
  $('wineForm').reset(); $('wineId').value=''; $('barcode').value=''; $('productId').value=''; $('labelImage').value=''; $('scanStatus').textContent='Velg strekkode eller etikett.'; $('scanPreview').hidden=true; $('scanPreview').src=''; $('candidateList').innerHTML=''; $('quantity').value=1;
}
function showStatus(text,busy=false){$('scanStatus').innerHTML=(busy?'<span class="loader"></span>':'')+safe(text)}
function fileToDataURL(file){return new Promise((r,j)=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.onerror=j;fr.readAsDataURL(file)})}

function waitForLibrary(name,timeout=8000){
  return new Promise(resolve=>{
    const started=Date.now();
    const check=()=>{if(window[name])return resolve(window[name]);if(Date.now()-started>=timeout)return resolve(null);setTimeout(check,100)};
    check();
  });
}
function imageFromUrl(url){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url})}
async function barcodeCanvases(url){
  const img=await imageFromUrl(url); const max=1800; const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  const w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
  const base=document.createElement('canvas');base.width=w;base.height=h;base.getContext('2d').drawImage(img,0,0,w,h);
  const variants=[base];
  for(const crop of [[0,.2,1,.6],[.1,.3,.8,.4],[0,0,1,.5],[0,.5,1,.5]]){
    const c=document.createElement('canvas'),sx=Math.round(w*crop[0]),sy=Math.round(h*crop[1]),sw=Math.round(w*crop[2]),sh=Math.round(h*crop[3]);
    c.width=sw;c.height=sh;c.getContext('2d').drawImage(base,sx,sy,sw,sh,0,0,sw,sh);variants.push(c);
  }
  // iPhone photos often leave the code as a small strip. Scan overlapping
  // horizontal bands, enlarge them, and add high-contrast copies.
  for(let y=0;y<=.8;y+=.1){
    const sx=0,sy=Math.round(h*y),sw=w,sh=Math.max(1,Math.round(h*.2));
    const band=document.createElement('canvas');band.width=2000;band.height=Math.max(220,Math.round(2000*sh/sw));
    const ctx=band.getContext('2d');ctx.drawImage(base,sx,sy,sw,sh,0,0,band.width,band.height);variants.push(band);
    const bw=document.createElement('canvas');bw.width=band.width;bw.height=band.height;
    const bx=bw.getContext('2d');bx.drawImage(band,0,0);const d=bx.getImageData(0,0,bw.width,bw.height);
    for(let i=0;i<d.data.length;i+=4){const g=.299*d.data[i]+.587*d.data[i+1]+.114*d.data[i+2];const v=g>145?255:0;d.data[i]=d.data[i+1]=d.data[i+2]=v}
    bx.putImageData(d,0,0);variants.push(bw);
  }
  return variants;
}

async function decodeBarcode(file){
  const url=await fileToDataURL(file);
  if('BarcodeDetector' in window){
    try{const detector=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128']});const bmp=await createImageBitmap(file);const codes=await detector.detect(bmp);if(codes[0]?.rawValue)return {code:codes[0].rawValue,url};}catch(e){}
  }
  const ZX=window.ZXing||await waitForLibrary('ZXing');
  if(ZX){
    const reader=new ZX.BrowserMultiFormatReader();
    try{
      for(const canvas of await barcodeCanvases(url)){
        try{const result=await reader.decodeFromCanvas(canvas);if(result?.getText())return {code:result.getText(),url};}catch(e){}
      }
      const result=await reader.decodeFromImageUrl(url);if(result?.getText())return {code:result.getText(),url};
    }catch(e){}
  }
  return {code:null,url,readerLoaded:Boolean(ZX)};
}
function validEan(code){
  if(!/^\d{13}$/.test(code))return false;
  const d=[...code].map(Number);let sum=0;
  for(let i=0;i<12;i++)sum+=d[i]*(i%2?3:1);
  return (10-sum%10)%10===d[12];
}
async function readBarcodeDigits(file){
  const OCR=window.Tesseract||await waitForLibrary('Tesseract',12000);
  if(!OCR)return '';
  try{
    const result=await OCR.recognize(file,'eng',{logger:()=>{}});
    const digits=String(result.data.text||'').replace(/[^0-9]/g,'');
    for(let i=0;i<=digits.length-13;i++){
      const code=digits.slice(i,i+13);if(validEan(code))return code;
    }
  }catch(e){}
  return '';
}
async function searchServer(params){
  const qs=new URLSearchParams(params);
  const res=await fetch('/api/wine-search?'+qs.toString());
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Søket mislyktes (${res.status})`);
  return data;
}
function setCandidates(items){
  $('candidateList').innerHTML=(items||[]).slice(0,5).map((x,i)=>`<button type="button" class="candidate" data-candidate="${i}"><strong>${safe(x.name)}</strong><small>${safe([x.producer,x.country,x.vintage].filter(Boolean).join(' · '))}</small></button>`).join('');
  document.querySelectorAll('[data-candidate]').forEach(b=>b.onclick=()=>fillCandidate(items[Number(b.dataset.candidate)]));
}
function fillCandidate(x){
  if(!x)return; ['name','producer','country','region','vintage','type','grapes','price','productId'].forEach(k=>{if($(k)&&x[k]!=null)$(k).value=x[k]});
  if(x.barcode)$('barcode').value=x.barcode;
  showStatus('Vinen er funnet. Kontroller opplysningene og lagre.');
}

async function handleBarcode(file){
  if(!file)return;showStatus('Bildet er mottatt. Leser strekkoden …',true);
  let decoded;
  try{decoded=await decodeBarcode(file)}catch(e){showStatus('Bildet kunne ikke leses. Prøv et nytt bilde i godt lys.');return}
  let {code,url,readerLoaded=true}=decoded; $('scanPreview').src=url;$('scanPreview').hidden=false;
  if(!code){
    showStatus('Strekene ble ikke gjenkjent. Leser tallene under koden …',true);
    code=await readBarcodeDigits(file);
  }
  if(!code){showStatus(readerLoaded?'Ingen strekkode funnet. Ta et skarpt bilde med både strekene og tallene synlige.':'Strekkodeleseren ble ikke lastet. Kontroller internettforbindelsen og åpne appen på nytt.');return}
  $('barcode').value=code; showStatus(`Fant strekkode ${code}. Søker automatisk …`,true);
  try{const data=await searchServer({barcode:code});setCandidates(data.results);if(data.results?.length){fillCandidate(data.results[0])}else{showStatus('Strekkoden ble lest, men ingen sikker vin ble funnet. Prøv etiketten.')}}catch(e){showStatus(e.message)}
}
function cleanOcrText(text){return text.split(/\n+/).map(s=>s.trim()).filter(s=>s.length>=3&&!/^\d+[,.]?\d*\s*%?$/.test(s)).slice(0,8).join(' ')}
async function handleLabel(file){
  if(!file)return;
  const url=await fileToDataURL(file); $('scanPreview').src=url;$('scanPreview').hidden=false;$('labelImage').value=url;
  showStatus('Bildet er mottatt. Klargjør tekstleseren …',true);
  const OCR=window.Tesseract||await waitForLibrary('Tesseract',12000);
  if(!OCR){showStatus('Tekstleseren ble ikke lastet. Kontroller internettforbindelsen og åpne appen på nytt.');return}
  showStatus('Leser teksten på etiketten …',true);
  try{
    const result=await OCR.recognize(file,'eng',{
      logger:m=>{if(m.status==='recognizing text')showStatus(`Leser etiketten … ${Math.round((m.progress||0)*100)} %`,true)}
    });
    const query=cleanOcrText(result.data.text||'');
    if(!query){showStatus('Jeg klarte ikke å lese nok tekst. Ta et skarpere bilde rett forfra.');return}
    showStatus('Etiketten er lest. Søker Vinmonopolet …',true);
    const data=await searchServer({label:query}); setCandidates(data.results);
    if(data.results?.length)fillCandidate(data.results[0]); else showStatus('Etiketten ble lest, men ingen sikker match ble funnet hos Vinmonopolet. Fyll inn manuelt eller prøv et nytt bilde.');
  }catch(e){showStatus(e.message||'Etikettlesingen mislyktes.')}
}

async function exportJson(){
  const payload={version:1,exportedAt:new Date().toISOString(),wines:await getAll('wines'),trips:await getAll('trips')};download('vinskap-backup.json',JSON.stringify(payload,null,2),'application/json')
}
async function exportCsv(){
  const wines=await getAll('wines');const cols=['name','type','vintage','producer','country','region','grapes','price','quantity','barcode','productId','notes'];
  const csv=[cols.join(';'),...wines.map(w=>cols.map(c=>'"'+String(w[c]??'').replaceAll('"','""')+'"').join(';'))].join('\n');download('vinskap.csv','\ufeff'+csv,'text/csv;charset=utf-8')
}
function download(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}

async function init(){
  await openDb();
  document.querySelectorAll('.add-wine,#quickAdd').forEach(b=>b.onclick=()=>{resetWineForm();openModal('wineModal')});
  $('addTripBtn').onclick=()=>{ $('tripForm').reset(); openModal('tripModal')};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  document.querySelectorAll('.bottomnav [data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.bottomnav button').forEach(x=>x.classList.remove('active'));$(b.dataset.view).classList.add('active');b.classList.add('active')});
  $('barcodeBtn').onclick=()=>{$('barcodeInput').value='';$('barcodeInput').click()};
  $('labelBtn').onclick=()=>{$('labelInput').value='';$('labelInput').click()};
  $('barcodeInput').addEventListener('change',e=>handleBarcode(e.target.files?.[0]));
  $('labelInput').addEventListener('change',e=>handleLabel(e.target.files?.[0]));
  $('wineForm').onsubmit=async e=>{e.preventDefault();const oldId=$('wineId').value;const w={id:oldId||uid(),createdAt:oldId?(await getAll('wines')).find(x=>x.id===oldId)?.createdAt||Date.now():Date.now()};['name','type','vintage','producer','country','region','grapes','price','quantity','notes','barcode','productId','labelImage'].forEach(k=>w[k]=$(k).value.trim());w.price=Number(String(w.price).replace(',','.'))||0;w.quantity=Math.max(1,Number(w.quantity)||1);await put('wines',w);closeModal('wineModal');render()};
  $('tripForm').onsubmit=async e=>{e.preventDefault();const f=$('tripImage').files[0];const t={id:uid(),createdAt:Date.now(),name:$('tripName').value.trim(),text:$('tripText').value.trim(),image:f?await fileToDataURL(f):''};await put('trips',t);closeModal('tripModal');render()};
  $('wineSearch').oninput=async()=>renderWineList(await getAll('wines'));$('wineTypeFilter').onchange=async()=>renderWineList(await getAll('wines'));
  $('exportBtn').onclick=$('backupJsonBtn').onclick=exportJson;$('backupCsvBtn').onclick=exportCsv;
  $('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());for(const w of data.wines||[])await put('wines',w);for(const t of data.trips||[])await put('trips',t);await render();alert('Backup importert.')}catch{alert('Kunne ikke lese backupfilen.')}};
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
  render();
}
init();
