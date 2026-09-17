const API='https://apis.vinmonopolet.no/products/v0/details-normal';

function normalize(s=''){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim()}
function words(s=''){return normalize(s).split(' ').filter(w=>w.length>2&&!/^\d{4}$/.test(w))}
function field(obj,...paths){for(const p of paths){let x=obj;for(const k of p.split('.'))x=x?.[k];if(x!==undefined&&x!==null&&x!=='')return x}return ''}
function grapeString(p){const arr=p?.ingredients?.grapes||[];return arr.map(g=>g.grapePct?`${g.grapeDesc} ${g.grapePct}%`:g.grapeDesc).filter(Boolean).join(', ')}
function mapProduct(p){
  const basic=p.basic||{}; const origin=p.origins?.origin||p.origins?.production||{}; const cls=p.classification||{};
  const price=(p.prices||[]).find(x=>x.salesPrice)?.salesPrice || (p.prices||[])[0]?.salesPrice || 0;
  const barcodes=(p.logistics?.barcodes||[]).map(x=>x.gtin).filter(Boolean);
  let type=cls.mainProductTypeName||cls.productTypeName||'Rødvin';
  if(/rose/i.test(type)) type='Rosévin'; else if(/hvit|white/i.test(type)) type='Hvitvin'; else if(/musser|sparkling/i.test(type)) type='Musserende'; else if(/champagne/i.test(type)) type='Champagne'; else if(/port/i.test(type)) type='Portvin'; else if(/rød|red/i.test(type)) type='Rødvin';
  return {productId:basic.productId||'',name:basic.productLongName||basic.productShortName||'',producer:field(p,'producer.name','producer.producerName','manufacturer.name','manufacturer.manufacturerName'),country:origin.country||'',region:origin.region||origin.subRegion||'',vintage:basic.vintage||'',type,grapes:grapeString(p),price,barcodes,barcode:barcodes.find(Boolean)||''};
}
async function vinmonopoletSearch(term){
  const key=process.env.VINMONOPOLET_API_KEY; if(!key) throw new Error('VINMONOPOLET_API_KEY mangler på serveren.');
  const url=new URL(API);url.searchParams.set('productShortNameContains',term);url.searchParams.set('maxResults','30');
  const r=await fetch(url,{headers:{'Ocp-Apim-Subscription-Key':key,'Accept':'application/json'}});
  if(!r.ok) throw new Error(`Vinmonopolet svarte ${r.status}.`);
  return (await r.json()).map(mapProduct);
}
async function barcodeName(barcode){
  try{const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,brands`);if(!r.ok)return '';const j=await r.json();return [j.product?.product_name,j.product?.brands].filter(Boolean).join(' ')}catch{return ''}
}
function score(item,query,barcode){
  let s=0; const q=words(query), hay=normalize([item.name,item.producer,item.country,item.region,item.vintage].join(' '));
  for(const w of q) if(hay.includes(w)) s+=w.length>6?3:1;
  if(barcode&&item.barcodes?.includes(barcode))s+=100;
  return s;
}
function candidatesFromLabel(label){
  const tokens=words(label).filter(w=>w.length>3); const year=(label.match(/\b(19|20)\d{2}\b/)||[])[0];
  const phrases=[]; for(let len=5;len>=1;len--){const p=tokens.slice(0,len).join(' ');if(p)phrases.push(p)}
  if(year)phrases.push(year); return [...new Set(phrases)].slice(0,5);
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=86400');
  try{
    const barcode=String(req.query.barcode||'').trim(); const label=String(req.query.label||'').trim(); const name=String(req.query.name||'').trim();
    let query=name||label; let results=[];
    if(barcode){
      const lookup=await barcodeName(barcode); query=lookup||'';
      if(query){for(const t of candidatesFromLabel(query)){results=await vinmonopoletSearch(t).catch(()=>[]);if(results.length)break}}
    }else if(query){
      for(const t of candidatesFromLabel(query)){results=await vinmonopoletSearch(t).catch(()=>[]);if(results.length)break}
    } else return res.status(400).json({error:'Mangler søkegrunnlag.'});
    results=results.map(x=>({...x,barcode:barcode||x.barcode,score:score(x,query,barcode)})).sort((a,b)=>b.score-a.score).slice(0,10);
    res.status(200).json({query,results,source:'Vinmonopolet'});
  }catch(e){res.status(500).json({error:e.message||'Ukjent feil'});}
};
