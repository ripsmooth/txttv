// Vercel serverless function. Reads Yle's rendered Teletext page 241.
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
 const matches=[]; let currentTime=''; let title='JALKAPALLO · VEIKKAUSLIIGA';
 const timeRe=/^(?:klo\s*)?(\d{1,2})[.:](\d{2})$/i;
 const teams=['FC Inter','AC Oulu','KuPS','HJK','TPS','VPS','FC Lahti','IF Gnistan','Ilves','FF Jaro','SJK','IFK Mariehamn'];
 const known=new RegExp('^('+teams.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|')+')\\s*(?:[-–—:]\\s*|\\s+)(?:(\\d{1,2})\\s*[-:]\\s*(\\d{1,2})\\s*)?('+teams.map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).sort((a,b)=>b.length-a.length).join('|')+')$', 'i');
 for (const line of lines) {
  if (/JALKAPALLO\s+VEIKKAUSLIIGA/i.test(line)) title=line.toUpperCase();
  const tm=line.match(timeRe) || line.match(/^klo\s+(\d{1,2})[.:](\d{2})/i);
  if(tm){currentTime=tm[1].padStart(2,'0')+'.'+tm[2];continue;}
  const m=line.match(known);
  if(m){ matches.push({time:currentTime,home:m[1],score:m[2]!==undefined?`${m[2]}–${m[3]}`:'–',away:m[4],status:m[2]!==undefined?'TULOS':'OHJELMASSA',live:false}); continue; }
  // More flexible match line parser for layouts that place the score between team names.
  const split=line.match(/^(.{2,24}?)\s+[-–—]\s+(.{2,24}?)(?:\s+(?:klo\s*)?(\d{1,2}[.:]\d{2}))?$/i);
  if(split && teams.some(t=>t.toLowerCase()===split[1].trim().toLowerCase()) && teams.some(t=>t.toLowerCase()===split[2].trim().toLowerCase())) {
    matches.push({time:split[3]||currentTime,home:split[1].trim(),score:'–',away:split[2].trim(),status:'OHJELMASSA',live:false});
  }
 }
 // Deduplicate identical team pairs; retain first parsed row.
 const seen=new Set(); return {title,matches:matches.filter(m=>{const k=(m.home+'|'+m.away).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;})};
}
export default async function handler(req,res) {
 const page=String(req.query.page||'241').replace(/\D/g,'').slice(0,3)||'241';
 if(!['241','242'].includes(page)){res.status(400).json({error:'Tämä grafiikka tukee sivuja 241 (ottelut) ja 242 (sarjataulukko).'});return;}
 try {
  const url=`https://yle.fi/aihe/tekstitv?P=${page}`;
  const upstream=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; TVOverlay/1.0)','Accept':'text/html'},cache:'no-store'});
  if(!upstream.ok) throw new Error(`Yle vastasi HTTP ${upstream.status}`);
  const html=await upstream.text(); const text=cleanHtml(html);
  const parsed=parseMatches(text);
  if(!parsed.matches.length) {
   res.status(502).json({error:'Ylen Teksti-TV -sivulta ei löytynyt tunnistettavia ottelurivejä.',source_preview:text.slice(0,2400),source_url:url});return;
  }
  res.setHeader('Cache-Control','s-maxage=2, stale-while-revalidate=3');
  res.status(200).json({page,title:parsed.title,footer:`Lähde: Yle Teksti-TV · sivu ${page}`,matches:parsed.matches,source_url:url});
 } catch(e) {res.status(502).json({error:e.message||'Ylen Teksti-TV:n haku epäonnistui.'});}
}
