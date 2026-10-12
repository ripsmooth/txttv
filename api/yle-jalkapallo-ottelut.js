function decodeEntities(s) {
 return s.replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
 .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}
function cleanHtml(html) {
 return decodeEntities(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|pre|tr|li|h\d|section|article)>/gi,'\n')
  .replace(/<[^>]+>/g,' ')).replace(/\r/g,'').split('\n')
  .map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}
function parseMatches(text) {
 const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
 const matches=[]; let title='JALKAPALLO · VEIKKAUSLIIGA';
 let inFootballSection=false;
 const seen=new Set();
 for(const line of lines){
  if(/JALKAPALLO\s+VEIKKAUSLIIGA/i.test(line)){title=line.toUpperCase();inFootballSection=true;continue;}
  if(inFootballSection && /Kokoonpanot\s+s\.\s*240|Taulukko\s+s\.\s*242/i.test(line)) break;
  if(!inFootballSection) continue;

  // Yle Teksti-TV page 241 uses e.g. "VPS - IF Gnistan 1-0 (1-0)".
  // Do not require a fixed team list: the league's team names can change by season.
  let m=line.match(/^(.+?)\s+[-–—]\s+(.+?)\s+(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\s*\(\s*\d{1,2}\s*[-–:]\s*\d{1,2}\s*\))?$/);
  if(m){
   const home=m[1].trim(), away=m[2].trim();
   if(home && away && home.length<50 && away.length<50){
    const key=(home+'|'+away).toLowerCase();
    if(!seen.has(key)){seen.add(key);matches.push({time:'',home,score:`${m[3]}–${m[4]}`,away,status:'TULOS',live:false});}
   }
   continue;
  }
  // Some schedule pages show a kickoff time instead of a score.
  m=line.match(/^(.+?)\s+[-–—]\s+(.+?)\s+(\d{1,2}[.:]\d{2})$/);
  if(m){
   const home=m[1].trim(), away=m[2].trim();
   if(home && away && home.length<50 && away.length<50){
    const key=(home+'|'+away).toLowerCase();
    if(!seen.has(key)){seen.add(key);matches.push({time:m[3].replace('.',':'),home,score:'–',away,status:'OHJELMASSA',live:false});}
   }
  }
 }
 return {title,matches};
}
export default async function handler(req,res){
 const page=String(req.query?.page||'241').replace(/\D/g,'').slice(0,3)||'241';
 if(!['241','242'].includes(page)){res.status(400).json({error:'Tuetut sivut: 241 ja 242.'});return;}
 const url=`https://yle.fi/aihe/tekstitv?P=${page}`;
 try{
  const upstream=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; TVOverlay/1.0)','Accept':'text/html'},cache:'no-store'});
  if(!upstream.ok)throw new Error(`Yle vastasi HTTP ${upstream.status}`);
  const html=await upstream.text();
  if(!html || !html.includes('<'))throw new Error('Ylen vastaus ei ollut HTML-sivu.');
  const parsed=parseMatches(cleanHtml(html));
  if(!parsed.matches.length){
   res.status(502).json({error:'Ylen sivulta ei löytynyt parserin tunnistamia ottelurivejä. Yle on voinut muuttaa sivun rakennetta.',source_url:url,source_preview:cleanHtml(html).slice(0,1800)});return;
  }
  res.setHeader('Cache-Control','s-maxage=2, stale-while-revalidate=3');
  res.status(200).json({page,title:parsed.title,footer:`Lähde: Yle Teksti-TV · sivu ${page}`,matches:parsed.matches,source_url:url});
 }catch(e){res.status(502).json({error:e.message||'Ylen Teksti-TV:n haku epäonnistui.'});}
}
