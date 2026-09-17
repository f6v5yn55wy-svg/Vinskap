const API_ROOT='https://apis.vinmonopolet.no/products/v0';

function text(value){return value==null?'':String(value).trim()}
function number(value){const n=Number(String(value??'').replace(',','.'));return Number.isFinite(n)?n:''}
function at(obj,...paths){
  for(const path of paths){
    let value=obj;
    for(const key of path.split('.'))value=value?.[key];
    if(value!=null&&value!=='')return value;
  }
  return '';
}
function key(value){return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9æøå]+/g,' ').trim()}
function tokens(value){return new Set(key(value).split(' ').filter(x=>x.length>2&&!/^(della|del|di|de|la|le|the|wine|vin|classico|classic)$/.test(x)))}
function grapesOf(row){
  const grapes=at(row,'ingredients.grapes','grapes','properties.grapes');
  if(!Array.isArray(grapes))return text(grapes);
  return grapes.map(g=>text(g.grapeDesc||g.name||g.grape)).filter(Boolean).join(', ');
}
function wineType(value){
  const v=key(value);
  if(v.includes('rose'))return 'Rosévin';
  if(v.includes('champagne'))return 'Champagne';
  if(v.includes('musserende')||v.includes('sparkling'))return 'Musserende';
  if(v.includes('portvin')||v.includes('port wine'))return 'Portvin';
  if(v.includes('dessert')||v.includes('sotvin'))return 'Dessertvin';
  if(v.includes('hvit')||v.includes('white'))return 'Hvitvin';
  return 'Rødvin';
}
function mapProduct(row){
  const productId=text(at(row,'basic.productId','productId','id','code'));
  const name=text(at(row,'basic.productLongName','basic.productShortName','productLongName','productShortName','name'));
  const producer=text(at(row,'basic.producerName','producer.name','producerName','producer'));
  const country=text(at(row,'origins.origin.country','origin.country','country'));
  const region=text(at(row,'origins.origin.region','origin.region','region','district'));
  const vintage=text(at(row,'properties.vintage','basic.vintage','vintage','year')).replace(/^0$/,'');
  const rawType=text(at(row,'classification.productType','basic.productType','productType','type'));
  const barcode=text(at(row,'logistics.gtin','basic.gtin','gtin','barcode','ean'));
  const price=number(at(row,'prices.salesPrice','prices.consumerPrice','price.salesPrice','salesPrice','price'));
  return {name,producer,country,region,vintage,type:wineType(rawType),grapes:grapesOf(row),price,productId,barcode,image:productId?`https://bilder.vinmonopolet.no/cache/515x515-0/${productId}-1.jpg`:''};
}
function rank(w,query){
  const wanted=tokens(query),hay=tokens([w.name,w.producer,w.country,w.region,w.vintage,w.grapes].join(' '));
  let found=0;for(const word of wanted)if([...hay].some(h=>h===word||h.includes(word)||word.includes(h)))found++;
  const coverage=wanted.size?found/wanted.size:0;
  const producer=[...wanted].some(word=>key(w.producer).includes(word))?2:0;
  const complete=['producer','country','region','vintage','grapes','price'].filter(k=>w[k]!==''&&w[k]!=null).length;
  return Math.round(coverage*10+producer+complete*.25);
}
async function officialSearch(query,apiKey){
  const headers={'Ocp-Apim-Subscription-Key':apiKey};
  const params=new URLSearchParams({productShortName:query,maxResults:'60'});
  const response=await fetch(`${API_ROOT}/details-normal?${params}`,{headers});
  if(!response.ok)throw new Error(`Vinmonopolet svarte ${response.status}`);
  const body=await response.json();
  return Array.isArray(body)?body:(body.products||body.items||body.results||[]);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=86400');
  const query=text(req.query?.name||req.query?.label||req.query?.barcode).slice(0,180);
  if(query.length<3)return res.status(400).json({error:'Skriv minst tre tegn.'});
  const apiKey=process.env.VINMONOPOLET_API_KEY;
  if(!apiKey)return res.status(503).json({error:'VINMONOPOLET_API_KEY mangler på serveren.'});
  try{
    const rows=await officialSearch(query,apiKey);
    const wines=rows.map(mapProduct).filter(w=>w.name);
    const barcode=text(req.query?.barcode);
    const filtered=barcode?wines.filter(w=>w.barcode===barcode):wines;
    const results=filtered.map(w=>({...w,score:rank(w,query)})).sort((a,b)=>b.score-a.score).slice(0,12);
    return res.status(200).json({source:'Vinmonopolet',results});
  }catch(error){return res.status(502).json({error:error.message||'Vinmonopolet-søket mislyktes.'})}
}
