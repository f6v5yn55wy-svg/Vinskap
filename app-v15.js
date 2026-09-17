const $ = (id) => document.getElementById(id);
const DB_NAME = 'vinskap-db';
const DB_VERSION = 1;
let db;
let tripPhotoFile=null;
let tripWinePhotoFile=null;
let activeTripId='';
let editingTripWineId='';
let detailTripWineId='';

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
function typeToZone(type){
  if(type==='Rødvin'||type==='Portvin')return 'red';
  if(type==='Rosévin')return 'rose';
  return 'white';
}

async function render(){
  const wines=await getAll('wines');
  const trips=await getAll('trips');
  const total=wines.reduce((s,w)=>s+(Number(w.quantity)||0),0);
  const val=wines.reduce((s,w)=>s+(Number(w.quantity)||0)*(Number(w.price)||0),0);
  $('totalBottles').textContent=total;
  $('totalValue').textContent=money(val);
  $('whiteCount').textContent=wines.filter(w=>typeToZone(w.type)==='white').reduce((s,w)=>s+(Number(w.quantity)||0),0);
  $('roseCount').textContent=wines.filter(w=>typeToZone(w.type)==='rose').reduce((s,w)=>s+(Number(w.quantity)||0),0);
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
function tripCard(t){
  const count=(t.wines||[]).length;
  return `<article class="trip-card trip-summary">${t.image?`<img class="trip-cover-image" src="${t.image}" alt="${safe(t.name)}">`:`<div class="trip-cover-placeholder">MIN TUR</div>`}<div class="trip-card-body"><h3>${safe(t.name)}</h3>${t.text?`<p>${safe(t.text)}</p>`:''}<div class="trip-card-footer"><button class="trip-open" data-trip-open="${t.id}">Åpne tur · ${count} ${count===1?'vin':'viner'}</button><button class="delete" data-trip-delete="${t.id}">Slett</button></div></div></article>`;
}
function tripWineCard(w){
  return `<article class="trip-wine-card"><button class="trip-wine-open" data-trip-wine-open="${w.id}" aria-label="Se detaljer om ${safe(w.name)}">${w.image?`<img src="${w.image}" alt="${safe(w.name)}">`:`<span class="trip-wine-image-placeholder">VIN</span>`}<span class="trip-wine-summary"><strong>${safe(w.name)}</strong>${w.vintage?`<span>Årgang ${safe(w.vintage)}</span>`:''}<small>Trykk for å se detaljer</small></span></button><div class="trip-wine-actions"><button class="trip-wine-edit" data-trip-wine-edit="${w.id}">Rediger</button><button class="trip-wine-delete" data-trip-wine-delete="${w.id}">Slett</button></div></article>`;
}
async function getActiveTrip(){return (await getAll('trips')).find(t=>t.id===activeTripId)}
async function openTripWineDetail(id){
  const trip=await getActiveTrip();const wine=(trip?.wines||[]).find(w=>w.id===id);if(!wine)return;
  detailTripWineId=id;
  $('tripWineDetailName').textContent=wine.name;
  $('tripWineDetailImage').hidden=!wine.image;$('tripWineDetailImage').src=wine.image||'';
  $('tripWineDetailVintage').hidden=!wine.vintage;$('tripWineDetailVintage').textContent=wine.vintage?`Årgang ${wine.vintage}`:'';
  $('tripWineDetailText').hidden=!wine.text;$('tripWineDetailText').textContent=wine.text||'';
  openModal('tripWineDetailModal');
}
async function openTripWineEditor(id=''){
  const trip=await getActiveTrip();const wine=(trip?.wines||[]).find(w=>w.id===id);
  editingTripWineId=wine?.id||'';tripWinePhotoFile=null;$('tripWineForm').reset();
  $('tripWineImagePreview').src=wine?.image||'';$('tripWineImagePreview').hidden=!wine?.image;
  $('tripWineImageName').textContent=wine?.image?'Nåværende bilde':'Ingen bilde valgt';
  $('tripWineFormTitle').textContent=wine?'Rediger vin':'Legg til vin';
  $('tripWineSaveBtn').textContent=wine?'Lagre endringer':'Lagre vin på turen';
  if(wine){$('tripWineName').value=wine.name||'';$('tripWineVintage').value=wine.vintage||'';$('tripWineText').value=wine.text||''}
  openModal('tripWineModal');
}
async function renderTripDetail(){
  const trip=(await getAll('trips')).find(t=>t.id===activeTripId);
  if(!trip)return;
  const wines=trip.wines||[];
  $('tripDetailTitle').textContent=trip.name;
  $('tripDetailText').textContent=trip.text||'';
  $('tripDetailText').hidden=!trip.text;
  $('tripDetailImage').hidden=!trip.image;
  $('tripDetailImage').src=trip.image||'';
  $('tripWineCount').textContent=`${wines.length} ${wines.length===1?'vin':'viner'}`;
  $('tripWineList').innerHTML=wines.length?[...wines].sort((a,b)=>b.createdAt-a.createdAt).map(tripWineCard).join(''):'<div class="card empty">Ingen viner lagt til ennå. Du kan legge til så mange du vil.</div>';
  document.querySelectorAll('[data-trip-wine-open]').forEach(b=>b.onclick=()=>openTripWineDetail(b.dataset.tripWineOpen));
  document.querySelectorAll('[data-trip-wine-edit]').forEach(b=>b.onclick=()=>openTripWineEditor(b.dataset.tripWineEdit));
  document.querySelectorAll('[data-trip-wine-delete]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Slette denne vinen fra turen?'))return;
    const trips=await getAll('trips');const current=trips.find(t=>t.id===activeTripId);if(!current)return;
    current.wines=(current.wines||[]).filter(w=>w.id!==b.dataset.tripWineDelete);
    await put('trips',current);await renderTripDetail();await render();
  });
}
async function openTrip(id){activeTripId=id;await renderTripDetail();openModal('tripDetailModal')}
function renderWineList(wines){
  const q=($('wineSearch').value||'').toLowerCase();
  const type=$('wineTypeFilter').value;
  const list=wines.filter(w=>(!type||w.type===type)&&(!q||JSON.stringify(w).toLowerCase().includes(q))).sort((a,b)=>b.createdAt-a.createdAt);
  $('wineList').innerHTML=list.length?list.map(w=>wineCard(w,true)).join(''):'<div class="card empty">Ingen viner matcher søket.</div>';
}
function bindDynamic(){
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Slette denne vinen?')){await del('wines',b.dataset.delete);render()}});
  document.querySelectorAll('[data-trip-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Slette denne turen og alle vinene i den?')){await del('trips',b.dataset.tripDelete);if(activeTripId===b.dataset.tripDelete)closeModal('tripDetailModal');render()}});
  document.querySelectorAll('[data-trip-open]').forEach(b=>b.onclick=()=>openTrip(b.dataset.tripOpen));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editWine(b.dataset.edit));
}
async function editWine(id){
  const wines=await getAll('wines'); const w=wines.find(x=>x.id===id); if(!w)return;
  resetWineForm(); Object.entries(w).forEach(([k,v])=>{if($(k))$(k).value=v??''}); $('wineId').value=w.id; openModal('wineModal');
}
function resetWineForm(){
  $('wineForm').reset(); $('wineId').value=''; $('barcode').value=''; $('productId').value=''; $('labelImage').value=''; $('scanStatus').textContent='Ta bilde av etiketten eller skriv inn navnet.'; $('scanPreview').hidden=true; $('scanPreview').src=''; $('candidateList').innerHTML=''; $('labelCorrection').hidden=false; $('labelSearchText').value=''; $('quantity').value=1;
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
    const url=await fileToDataURL(file);
    const variants=await barcodeCanvases(url);
    // Try the whole photo and the lower half, where bottle barcodes normally sit.
    for(const image of [variants[0],variants[4]]){
      const result=await OCR.recognize(image,'eng',{
        logger:()=>{},
        tessedit_char_whitelist:'0123456789',
        tessedit_pageseg_mode:'6'
      });
      const digits=String(result.data.text||'').replace(/[^0-9]/g,'');
      for(let i=0;i<=digits.length-13;i++){
        const code=digits.slice(i,i+13);if(validEan(code))return code;
      }
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
  if(!x)return;
  ['name','producer','country','region','vintage','type','grapes','price','productId'].forEach(k=>{
    if($(k)&&x[k]!=null&&x[k]!=='')$(k).value=Array.isArray(x[k])?x[k].join(', '):x[k]
  });
  if(x.barcode)$('barcode').value=x.barcode;
  if(x.image&&!$('labelImage').value)$('labelImage').value=x.image;
  const filled=['producer','country','region','vintage','grapes','price'].filter(k=>x[k]!=null&&x[k]!==''&&(Array.isArray(x[k])?x[k].length:true)).length;
  showStatus(filled>=3?'Vinen er funnet og opplysningene er fylt ut. Kontroller og lagre.':'Vinen ble valgt, men kilden mangler flere opplysninger. Fyll inn det som mangler før du lagrer.');
}

function showLabelCorrection(text=''){
  $('labelCorrection').hidden=false;
  $('labelSearchText').value=normalizeWineText(text);
}
async function searchCorrectedLabel(){
  const query=normalizeWineText($('labelSearchText').value);
  if(query.length<3){showStatus('Skriv minst navnet eller produsenten fra etiketten.');$('labelSearchText').focus();return}
  showStatus(`Søker bredt etter «${query}» …`,true);
  $('candidateList').innerHTML='';
  try{
    const results=await searchWineName(query);
    setCandidates(results);
    if(!results.length){showStatus('Ingen treff. Prøv produsent og vinnavn, gjerne med årgang.');return}
    const best=Number(results[0]?._matchScore)||0;
    const second=Number(results[1]?._matchScore)||0;
    if(best>=58 && (results.length===1 || best-second>=8))fillCandidate(results[0]);
    else showStatus('Jeg fant flere mulige viner. Velg riktig vin fra forslagene under.');
  }catch(e){showStatus(e.message||'Søket mislyktes.')}
}

function searchKey(value){
  return normalizeWineText(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9æøå]+/g,' ').trim();
}
function wineWords(value){
  return new Set(searchKey(value).split(' ').filter(w=>w.length>2&&!/^(della|del|di|de|la|le|the|wine|vin|classico|classic)$/.test(w)));
}
function manualSearchQueries(value){
  const original=normalizeWineText(value);
  const noYear=original.replace(/\b(19|20)\d{2}\b/g,'').replace(/\s+/g,' ').trim();
  const words=noYear.split(' ').filter(Boolean);
  const queries=[original,noYear];
  if(words.length>3){queries.push(words.slice(0,3).join(' '));queries.push(words.slice(-3).join(' '))}
  return [...new Set(queries.filter(q=>q.length>=3))].slice(0,4);
}
function candidateIdentity(x){
  return String(x.productId||x.barcode||[x.name,x.producer,x.vintage].map(searchKey).join('|'));
}
function rankCandidate(x,query){
  const wanted=wineWords(query);
  const haystack=searchKey([x.name,x.producer,x.vintage,x.country,x.region,x.grapes].flat().filter(Boolean).join(' '));
  const found=[...wanted].filter(w=>haystack.split(' ').some(h=>h===w||h.includes(w)||w.includes(h))).length;
  const coverage=wanted.size?found/wanted.size:0;
  const exactName=searchKey(x.name)===searchKey(query)?24:0;
  const completeness=['producer','country','region','vintage','type','grapes','price'].filter(k=>x[k]!=null&&x[k]!==''&&(Array.isArray(x[k])?x[k].length:true)).length;
  const producerBonus=x.producer&&[...wanted].some(w=>searchKey(x.producer).includes(w))?18:0;
  const conflict=[...wanted].length>=2&&found<2?-24:0;
  return Math.round(coverage*62+exactName+producerBonus+conflict+completeness*3+(Number(x.score)||0)*2);
}
async function searchWineName(query){
  const responses=await Promise.all(manualSearchQueries(query).map(name=>searchServer({name}).catch(()=>({results:[]}))));
  const merged=new Map();
  for(const item of responses.flatMap(data=>data.results||[])){
    const key=candidateIdentity(item);const previous=merged.get(key);
    if(!previous||rankCandidate(item,query)>rankCandidate(previous,query))merged.set(key,item);
  }
  return [...merged.values()].map(item=>({...item,_matchScore:rankCandidate(item,query)})).sort((a,b)=>b._matchScore-a._matchScore).slice(0,8);
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
  try{
    const saved=(await getAll('wines')).find(w=>String(w.barcode||'')===String(code));
    if(saved){fillCandidate(saved);return}
    const data=await searchServer({barcode:code});setCandidates(data.results);
    if(data.results?.length){fillCandidate(data.results[0])}
    else{showStatus('Strekkoden ble lest, men finnes ikke i strekkodedatabasen. Ta bilde av etiketten. Koden lagres sammen med vinen.')}
  }catch(e){showStatus(e.message)}
}
function normalizeWineText(value){
  return String(value||'')
    .replace(/ß/g,'ss')
    .replace(/[|_~^*{}\[\]<>]/g,' ')
    .replace(/\s+/g,' ')
    .replace(/\b(?:LPOLIGELLA|VALPOLIGELLA|VALP0LICELLA)\b/gi,'VALPOLICELLA')
    .replace(/\bAMAR0NE\b/gi,'AMARONE')
    .trim();
}

async function labelOcrImages(file){
  const url=await fileToDataURL(file);
  const img=await imageFromUrl(url);
  const make=(crop=false,contrast=false)=>{
    const canvas=document.createElement('canvas');
    const sx=crop?Math.round(img.width*.12):0, sy=crop?Math.round(img.height*.12):0;
    const sw=crop?Math.round(img.width*.76):img.width, sh=crop?Math.round(img.height*.78):img.height;
    const scale=Math.min(2,1600/sw);canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
    const ctx=canvas.getContext('2d');ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    if(contrast){const frame=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=0;i<frame.data.length;i+=4){const g=.299*frame.data[i]+.587*frame.data[i+1]+.114*frame.data[i+2];const v=g>145?255:g<75?0:Math.round((g-75)*255/70);frame.data[i]=frame.data[i+1]=frame.data[i+2]=v}ctx.putImageData(frame,0,0)}
    return canvas;
  };
  return [make(false,false),make(true,true)];
}
function ocrNameVariants(value){
  const base=normalizeWineText(value);
  const variants=[base];
  // Tesseract often reads the German ß on wine labels as a lower-case p.
  // Example: Meßmer -> Mepmer. Also try the searchable spelling Messmer.
  const sharpS=base.replace(/([a-zæøå])[pb8](?=[a-zæøå])/gi,'$1ss');
  if(sharpS!==base)variants.push(sharpS);
  return variants;
}
function labelSearchQueries(text){
  const generic=/^(riesling|trocken|estate|wein|wine|vin|white|red|blanc|rouge|reserve|classic|selection|qualitatswein|qualitaetswein)$/i;
  const lines=String(text||'').split(/\n+/)
    .map(normalizeWineText)
    .map(s=>s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}. -]+$/gu,''))
    .filter(s=>s.length>=3&&!/^\d+[,.]?\d*\s*%?$/.test(s));
  const lineScore=s=>{
    const alpha=s.match(/[\p{L}]+/gu)||[];
    return Math.max(0,...alpha.map(w=>w.length))*3 + alpha.join('').length - (/\d/.test(s)?4:0);
  };
  const useful=lines.filter(s=>!generic.test(s)).sort((a,b)=>lineScore(b)-lineScore(a));
  const varietals=lines.filter(s=>/riesling|chardonnay|sauvignon|pinot|cabernet|merlot|syrah|tempranillo|nebbiolo|barolo|rioja/i.test(s));
  const candidates=[];
  const names=useful.filter(s=>
    !/riesling|chardonnay|sauvignon|pinot|cabernet|merlot|syrah|tempranillo|nebbiolo|barolo|rioja|trocken|estate/i.test(s)
    && !/\d/.test(s)
  );
  // Try corrected producer/brand names together with the grape first.
  // A single word such as Messmer does not meet the server's confidence
  // threshold, while "Messmer Riesling" is a strong match.
  for(const name of names.slice(0,6)){
    for(const variant of ocrNameVariants(name)){
      if(varietals[0])candidates.push(`${variant} ${varietals[0]}`);
    }
  }
  if(useful[0]&&varietals[0])candidates.push(`${useful[0]} ${varietals[0]}`);
  for(const line of useful.slice(0,6))candidates.push(...ocrNameVariants(line));
  if(lines.length)candidates.push(lines.slice(0,4).join(' '));
  return [...new Set(candidates.map(normalizeWineText).filter(s=>s.length>=3))].slice(0,8);
}
async function searchLabelQueries(queries){
  let best={results:[]};
  let bestScore=0;
  for(const label of queries){
    const data=await searchServer({label});
    const score=Math.max(0,...(data.results||[]).map(x=>Number(x.score)||0));
    if(score>bestScore){best=data;bestScore=score}
    if(score>=6)return data;
  }
  return best;
}
async function handleLabel(file){
  if(!file)return;
  const url=await fileToDataURL(file); $('scanPreview').src=url;$('scanPreview').hidden=false;$('labelImage').value=url;
  showStatus('Bildet er mottatt. Klargjør tekstleseren …',true);
  const OCR=window.Tesseract||await waitForLibrary('Tesseract',12000);
  if(!OCR){showStatus('Tekstleseren ble ikke lastet. Kontroller internettforbindelsen og åpne appen på nytt.');return}
  showStatus('Leser teksten på etiketten …',true);
  try{
    const images=await labelOcrImages(file);
    const texts=[];
    for(let i=0;i<images.length;i++){
      const result=await OCR.recognize(images[i],'deu+eng',{
        tessedit_pageseg_mode:i?'11':'6',
        logger:m=>{if(m.status==='recognizing text')showStatus(`Leser etiketten … ${Math.round(((i+(m.progress||0))/images.length)*100)} %`,true)}
      });
      texts.push(result.data.text||'');
    }
    const queries=labelSearchQueries(texts.join('\n'));
    if(!queries.length){showLabelCorrection('');showStatus('Jeg klarte ikke å lese nok tekst. Skriv navnet fra etiketten i feltet under.');return}
    showLabelCorrection(queries[0]);
    showStatus('Etiketten er lest. Søker Vinmonopolet …',true);
    const data=await searchLabelQueries(queries); setCandidates(data.results);
    const results=data.results||[];
    const best=Math.max(0,...results.map(x=>Number(x.score)||0));
    if(best>=6){fillCandidate(results[0])}
    else if(results.length)showStatus('Jeg fant forslag, men er ikke sikker. Rett teksten fra etiketten eller velg riktig vin under.');
    else showStatus('Ingen sikker match ble funnet. Rett teksten fra etiketten og trykk «Søk etter vinen».');
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
  $('addTripBtn').onclick=()=>{
    $('tripForm').reset();
    tripPhotoFile=null;
    $('tripImageName').textContent='Ingen bilde valgt';
    $('tripImagePreview').src='';
    $('tripImagePreview').hidden=true;
    openModal('tripModal');
  };
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
  document.querySelectorAll('.bottomnav [data-view]').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));document.querySelectorAll('.bottomnav button').forEach(x=>x.classList.remove('active'));$(b.dataset.view).classList.add('active');b.classList.add('active')});
  $('labelBtn').onclick=()=>{$('labelInput').value='';$('labelInput').click()};
  $('labelSearchBtn').onclick=searchCorrectedLabel;
  $('labelSearchText').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchCorrectedLabel()}});
  $('labelInput').addEventListener('change',e=>handleLabel(e.target.files?.[0]));
  const chooseTripPhoto=async file=>{
    if(!file)return;
    tripPhotoFile=file;
    $('tripImageName').textContent=file.name||'Bilde valgt';
    $('tripImagePreview').src=await fileToDataURL(file);
    $('tripImagePreview').hidden=false;
  };
  $('tripCameraBtn').onclick=()=>{$('tripImageCamera').value='';$('tripImageCamera').click()};
  $('tripGalleryBtn').onclick=()=>{$('tripImageGallery').value='';$('tripImageGallery').click()};
  $('tripImageCamera').addEventListener('change',e=>chooseTripPhoto(e.target.files?.[0]));
  $('tripImageGallery').addEventListener('change',e=>chooseTripPhoto(e.target.files?.[0]));
  const chooseTripWinePhoto=async file=>{
    if(!file)return;
    tripWinePhotoFile=file;
    $('tripWineImageName').textContent=file.name||'Bilde valgt';
    $('tripWineImagePreview').src=await fileToDataURL(file);
    $('tripWineImagePreview').hidden=false;
  };
  $('addTripWineBtn').onclick=()=>openTripWineEditor();
  $('tripWineDetailEditBtn').onclick=()=>{const id=detailTripWineId;closeModal('tripWineDetailModal');openTripWineEditor(id)};
  $('tripWineCameraBtn').onclick=()=>{$('tripWineImageCamera').value='';$('tripWineImageCamera').click()};
  $('tripWineGalleryBtn').onclick=()=>{$('tripWineImageGallery').value='';$('tripWineImageGallery').click()};
  $('tripWineImageCamera').addEventListener('change',e=>chooseTripWinePhoto(e.target.files?.[0]));
  $('tripWineImageGallery').addEventListener('change',e=>chooseTripWinePhoto(e.target.files?.[0]));
  $('wineForm').onsubmit=async e=>{e.preventDefault();const oldId=$('wineId').value;const w={id:oldId||uid(),createdAt:oldId?(await getAll('wines')).find(x=>x.id===oldId)?.createdAt||Date.now():Date.now()};['name','type','vintage','producer','country','region','grapes','price','quantity','notes','barcode','productId','labelImage'].forEach(k=>w[k]=$(k).value.trim());w.price=Number(String(w.price).replace(',','.'))||0;w.quantity=Math.max(1,Number(w.quantity)||1);await put('wines',w);closeModal('wineModal');render()};
  $('tripForm').onsubmit=async e=>{e.preventDefault();const t={id:uid(),createdAt:Date.now(),name:$('tripName').value.trim(),text:$('tripText').value.trim(),image:tripPhotoFile?await fileToDataURL(tripPhotoFile):'',wines:[]};await put('trips',t);tripPhotoFile=null;closeModal('tripModal');await render();await openTrip(t.id)};
  $('tripWineForm').onsubmit=async e=>{
    e.preventDefault();const trips=await getAll('trips');const trip=trips.find(t=>t.id===activeTripId);if(!trip)return;
    const current=(trip.wines||[]).find(w=>w.id===editingTripWineId);
    const wine={id:current?.id||uid(),createdAt:current?.createdAt||Date.now(),name:$('tripWineName').value.trim(),vintage:$('tripWineVintage').value.trim(),text:$('tripWineText').value.trim(),image:tripWinePhotoFile?await fileToDataURL(tripWinePhotoFile):(current?.image||'')};
    trip.wines=current?(trip.wines||[]).map(w=>w.id===current.id?wine:w):[...(trip.wines||[]),wine];
    await put('trips',trip);tripWinePhotoFile=null;editingTripWineId='';closeModal('tripWineModal');await renderTripDetail();await render();
  };
  $('wineSearch').oninput=async()=>renderWineList(await getAll('wines'));$('wineTypeFilter').onchange=async()=>renderWineList(await getAll('wines'));
  $('exportBtn').onclick=$('backupJsonBtn').onclick=exportJson;$('backupCsvBtn').onclick=exportCsv;
  $('importBtn').onclick=()=>$('importInput').click();$('importInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());for(const w of data.wines||[])await put('wines',w);for(const t of data.trips||[])await put('trips',t);await render();alert('Backup importert.')}catch{alert('Kunne ikke lese backupfilen.')}};
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
  render();
}
init();

