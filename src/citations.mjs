// Small, deterministic citation-network model used by the PWA without a graph library.
export function openAlexWorkId(value){
  const text=String(value||'');
  const match=text.match(/(?:^|\/)(W\d{3,})$/i);
  return match?match[1].toUpperCase():'';
}
export function citationLookupUrl(article,key=''){
  const id=openAlexWorkId(article?.openAlexId||article?.id);
  const url=new URL('https://api.openalex.org/works');
  if(id)url.pathname+='/'+id;
  else if(article?.doi)url.searchParams.set('filter','doi:https://doi.org/'+String(article.doi).replace(/^https?:\/\/doi\.org\//i,''));
  else return '';
  if(!id)url.searchParams.set('per_page','1');
  if(key)url.searchParams.set('api_key',key);
  return url.toString();
}
export function citationNeighborsUrl(id,kind,key='',perPage=10){
  const work=openAlexWorkId(id);
  if(!work)throw new Error('Identifiant OpenAlex absent.');
  if(kind!=='citing')throw new Error('Type de relation non reconnu.');
  const url=new URL('https://api.openalex.org/works');
  url.searchParams.set('filter','cites:'+work);
  url.searchParams.set('sort','publication_date:desc');
  url.searchParams.set('per_page',String(Math.min(Math.max(1,perPage),50)));
  if(key)url.searchParams.set('api_key',key);
  return url.toString();
}
export function batchWorksUrl(ids,key='',limit=22){
  const selected=[...new Set(ids.map(openAlexWorkId).filter(Boolean))].slice(0,Math.min(100,limit));
  if(!selected.length)return '';
  const url=new URL('https://api.openalex.org/works');
  url.searchParams.set('filter','openalex:'+selected.join('|'));
  url.searchParams.set('per_page',String(selected.length));
  if(key)url.searchParams.set('api_key',key);
  return url.toString();
}
export function graphNode(work,category='seed'){
  const id=openAlexWorkId(work?.id);
  if(!id)return null;
  const doi=String(work.doi||'').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'');
  return {id,title:String(work.title||work.display_name||'Sans titre'),
    year:Number(work.publication_year)||null,citedBy:Number(work.cited_by_count)||0,
    doi,category,url:doi?'https://doi.org/'+doi:'https://openalex.org/'+id,
    authors:(work.authorships||[]).map(a=>a.author?.display_name).filter(Boolean).slice(0,4)};
}
export function buildCitationGraph(seed,{references=[],citing=[],related=[]}={}){
  const main=graphNode(seed,'seed');
  if(!main)throw new Error('Publication OpenAlex introuvable.');
  const nodes=[main],edges=[],used=new Set([main.id]);
  const groups={references:[],citing:[],related:[]};
  for(const [type,works,max] of [['references',references,10],['citing',citing,10],['related',related,6]]){
    for(const work of works){
      const node=graphNode(work,type);
      if(!node||node.id===main.id)continue;
      const key=type+':'+node.id;
      if(edges.some(e=>e.key===key))continue;
      if(groups[type].length>=max)break;
      if(!used.has(node.id)){nodes.push(node);used.add(node.id);}
      const source=type==='citing'?node.id:main.id;
      const target=type==='citing'?main.id:node.id;
      edges.push({key,source,target,type});
      groups[type].push(node.id);
    }
  }
  return {seed:main.id,nodes,edges,groups,
    totals:{references:groups.references.length,citing:groups.citing.length,related:groups.related.length}};
}
export function citationLayout(graph){
  const positions={[graph.seed]:{x:500,y:260}};
  const spread=(ids,kind)=>{
    const n=ids.length;
    ids.forEach((id,i)=>{
      const t=(i+.5)/Math.max(1,n);
      if(kind==='references')positions[id]={x:145+90*(i%2),y:66+t*385};
      if(kind==='citing')positions[id]={x:768+85*(i%2),y:66+t*385};
      if(kind==='related')positions[id]={x:260+t*490,y:530+(i%2)*40};
    });
  };
  spread(graph.groups.references,'references');
  spread(graph.groups.citing,'citing');
  spread(graph.groups.related,'related');
  return positions;
}
