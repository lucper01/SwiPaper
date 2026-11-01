// An optional, authenticated Google Scholar connector through SerpApi.
// SERPAPI_KEY and CLIENT_ACCESS_TOKEN are Cloudflare secrets, never frontend values.
const json=(data,status,origin)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'no-store',
  ...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{})}});
export default {async fetch(request,env){
 const origin=request.headers.get('Origin')||'';
 const allowed=env.CLIENT_ORIGIN||'https://lucper01.github.io';
 if(origin!==allowed)return json({error:'Origin not permitted'},403,'');
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{
  'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'X-Swipaper-Token',
  'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Max-Age':'3600','Vary':'Origin'}});
 if(request.method!=='GET')return json({error:'Unsupported method'},405,origin);
 if(!env.SERPAPI_KEY||!env.CLIENT_ACCESS_TOKEN||!env.SCHOLAR_RATE_LIMITER)
   return json({error:'Connector not configured'},503,origin);
 if(request.headers.get('X-Swipaper-Token')!==env.CLIENT_ACCESS_TOKEN)
   return json({error:'Authentication required'},401,origin);
 const {success}=await env.SCHOLAR_RATE_LIMITER.limit({key:'scholar-api'});
 if(!success)return json({error:'Request limit reached'},429,origin);
 const u=new URL(request.url);
 if(u.pathname!=='/api/scholar')return json({error:'Not found'},404,origin);
 const q=String(u.searchParams.get('q')||'').trim(),from=u.searchParams.get('from')||'';
 const page=Number(u.searchParams.get('page')||1);
 if(!q||q.length>350||!Number.isInteger(page)||page<1||page>5||!/^\d{4}-\d{2}-\d{2}$/.test(from))
   return json({error:'Invalid query'},400,origin);
 const api=new URL('https://serpapi.com/search.json');
 for(const [k,v] of Object.entries({engine:'google_scholar',q,start:String((page-1)*10),num:'10',as_ylo:from.slice(0,4),api_key:env.SERPAPI_KEY}))api.searchParams.set(k,v);
 try{
  const response=await fetch(api);
  if(!response.ok)return json({error:'Scholar provider HTTP '+response.status},502,origin);
  const body=await response.json();
  if(body.error)return json({error:'Scholar provider error'},502,origin);
  return json({results:(body.organic_results||[]).slice(0,10).map(r=>({
   title:String(r.title||'').slice(0,500),link:String(r.link||'').slice(0,1500),
   snippet:String(r.snippet||'').slice(0,1600),
   reference:String(r.publication_info?.summary||'').slice(0,500)
  }))},200,origin);
 }catch{return json({error:'Scholar provider unavailable'},502,origin);}
}};