export function resetLocalLibraryState(current, forgetProcessed=false) {
  const updated={...current, library:{}};
  if(forgetProcessed) {
    updated.seen={};
    updated.history=[];
    updated.active=null;
    updated.lastSummary=null;
    updated.alerts={lastCheck:null,known:[],unseen:[]};
  }
  return updated;
}
export function abstractFromIndex(index) {
  if (!index || typeof index !== 'object') return '';
  const words=[];
  for(const [word,positions] of Object.entries(index)) {
    if(!Array.isArray(positions))continue;
    for(const position of positions)if(Number.isInteger(position)&&position>=0&&position<10000)words[position]=word;
  }
  return words.map(word=>word||'').join(' ').replace(/\s+/g,' ').trim();
}
export function cleanDoi(value) {
  const doi=String(value||'').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'').replace(/[.,;]$/,'');
  return /^10\.\d{4,9}\/\S+$/i.test(doi)?doi:'';
}
export function safeUrl(value) {
  try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';}catch{return '';}
}
export function normalizeTitle(text) {
  const result=String(text||'').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
  return result.length>=20&&result.split(' ').length>=3?result:'';
}
export function extractPmid(value) {
  const s=String(value||'');
  const match=s.match(/(?:pubmed\.ncbi\.nlm\.nih\.gov\/|PMID\s*[:=]\s*)(\d{3,12})/i);
  return match?.[1]||(/^\d{3,12}$/.test(s.trim())?s.trim():'');
}
export function fingerprints(article) {
  const ids=[];
  const doi=cleanDoi(article?.doi||article?.DOI||(article?.url||article?.URL||''));
  const pmid=extractPmid(article?.pmid||article?.PMID||article?.url||article?.URL||article?.extra);
  const title=normalizeTitle(article?.title);
  if(doi)ids.push('doi:'+doi.toLowerCase());
  if(pmid)ids.push('pmid:'+pmid);
  if(title)ids.push('title:'+title);
  if(article?.id && !ids.length)ids.push('id:'+String(article.id).toLowerCase());
  return ids;
}
export function zoteroFingerprints(item) {
  const d=item?.data||item||{};
  const combined={doi:d.DOI||d.doi||d.url,pmid:d.PMID||extractPmid(d.extra),title:d.title,url:d.url,extra:d.extra};
  return fingerprints(combined);
}
export function cutoffFromPeriod(count=30,unit='days',now=new Date()) {
  const n=Number(count);
  if(!Number.isInteger(n)||n<1||n>3650)throw new Error('La période doit être un entier positif de 1 à 3650.');
  if(!['days','months','years'].includes(unit))throw new Error('Unité de période invalide.');
  const end=new Date(now);
  if(unit==='days'){end.setUTCDate(end.getUTCDate()-n);}
  else {
    const years=unit==='years'?n:n/12;
    const totalMonths=unit==='years'?n*12:n;
    const originalDay=end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth()-totalMonths);
    const lastDay=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
    end.setUTCDate(Math.min(originalDay,lastDay));
  }
  return end.toISOString().slice(0,10);
}
export function toArticle(work,topic='') {
  const doi=cleanDoi(work.doi);
  const pmid=extractPmid(work.ids?.pmid||work.ids?.pubmed||'');
  const authors=(work.authorships||[]).map(a=>a.author?.display_name).filter(Boolean).slice(0,30);
  const landing=safeUrl(work.best_oa_location?.landing_page_url||work.primary_location?.landing_page_url||work.id);
  const pdf=safeUrl(work.best_oa_location?.pdf_url||work.primary_location?.pdf_url||'');
  return {
    id:doi?'doi:'+doi.toLowerCase():(pmid?'pmid:'+pmid:String(work.id||'').trim()),
    source:'OpenAlex', title:String(work.title||work.display_name||'Sans titre'),
    abstract:abstractFromIndex(work.abstract_inverted_index),authors,
    journal:String(work.primary_location?.source?.display_name||work.best_oa_location?.source?.display_name||''),
    year:Number(work.publication_year)||null,date:String(work.publication_date||''),
    doi,pmid,url:doi?'https://doi.org/'+doi:landing,pdf,
    openAccess:!!(work.open_access?.is_oa||pdf),topic
  };
}
function stripMarkup(html) {
  return String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
    .replace(/\s+/g,' ').trim();
}
export function toEuropePMCArticle(work,topic='') {
  const doi=cleanDoi(work.doi);
  const pmid=extractPmid(work.pmid);
  const firstDate=String(work.firstPublicationDate||work.electronicPublicationDate||'');
  const date=/^\d{4}-\d{2}-\d{2}$/.test(firstDate)?firstDate:'';
  const links=work.fullTextUrlList?.fullTextUrl||[];
  const pdfUrl=links.find(l=>l.documentStyle==='pdf'||/\.pdf(?:$|\?)/i.test(l.url||''))?.url||'';
  const url=doi?'https://doi.org/'+doi:pmid?'https://pubmed.ncbi.nlm.nih.gov/'+pmid+'/':safeUrl(work.pmcid?'https://europepmc.org/articles/'+work.pmcid:'https://europepmc.org/article/'+String(work.source||'MED')+'/'+String(work.id||''));
  const authors=work.authorList?.author?.map(a=>[a.firstName,a.lastName].filter(Boolean).join(' ')).filter(Boolean)
    ||(work.authorString?work.authorString.split(/\s*,\s*/).filter(Boolean):[]);
  return {
    id:doi?'doi:'+doi.toLowerCase():pmid?'pmid:'+pmid:'epmc:'+String(work.source||'')+':'+String(work.id||''),
    source:pmid?'PubMed / Europe PMC':'Europe PMC',
    title:stripMarkup(work.title)||'Sans titre',abstract:stripMarkup(work.abstractText),
    authors:authors.slice(0,30),journal:String(work.journalTitle||work.journalInfo?.journal?.title||''),
    year:Number(work.pubYear)||null,date,doi,pmid,url,pdf:safeUrl(pdfUrl),
    openAccess:work.isOpenAccess==='Y'||!!pdfUrl,topic
  };
}
export function deduplicate(articles) {
  const known=new Set();
  return articles.filter(a=>{
    const keys=fingerprints(a);
    if(keys.some(k=>known.has(k)))return false;
    keys.forEach(k=>known.add(k));
    return !!a.id;
  });
}
export function isFresh(article,{cutoff,seen=[],saved=[],zotero=[]}={}) {
  if(!article||!article.date||!/^\d{4}-\d{2}-\d{2}$/.test(article.date))return false;
  if(cutoff&&article.date<cutoff)return false;
  if(article.date>new Date().toISOString().slice(0,10))return false;
  const known=new Set([...seen,...saved,...zotero]);
  return !fingerprints(article).some(k=>known.has(k));
}
export function openAlexUrl(query,{cutoff='',days=365,perPage=50,page=1,key=''}={}) {
  const start=cutoff||cutoffFromPeriod(days,'days');
  const url=new URL('https://api.openalex.org/works');
  url.searchParams.set('search',String(query).trim());
  url.searchParams.set('filter','from_publication_date:'+start+',has_abstract:true');
  url.searchParams.set('sort','publication_date:desc');
  url.searchParams.set('per_page',String(Math.min(Math.max(1,perPage),100)));
  url.searchParams.set('page',String(Math.max(1,page)));
  if(key)url.searchParams.set('api_key',key);
  return url.toString();
}
export function europePmcUrl(query,{cutoff='',page=1,pageSize=50}={}) {
  const from=cutoff||cutoffFromPeriod(365,'days');
  const until=new Date().toISOString().slice(0,10);
  const url=new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query','('+String(query).trim()+') AND FIRST_PDATE:['+from+' TO '+until+'] sort_date:y');
  url.searchParams.set('resultType','core');
  url.searchParams.set('format','json');
  url.searchParams.set('pageSize',String(Math.min(Math.max(1,pageSize),100)));
  url.searchParams.set('page',String(Math.max(1,page)));
  return url.toString();
}
export function risFingerprints(source) {
  const rows=String(source||'').replace(/^\uFEFF/,'').split(/\r?\n/);
  const keys=new Set();
  let item={},count=0,last='';
  function finish() {
    if(!item.title&&!item.DOI&&!item.url){item={};last='';return;}
    const f=fingerprints(item);
    if(f.length){count++;for(const key of f)keys.add(key);}
    item={};last='';
  }
  for(const line of rows){
    const match=line.match(/^([A-Z0-9]{2})\s+-\s*(.*)$/);
    if(!match){
      if(last&&line.trim())item[last]=(item[last]||'')+' '+line.trim();
      continue;
    }
    const field=match[1],value=match[2].trim();
    if(field==='TY'){if(Object.keys(item).length)finish();continue;}
    if(field==='ER'){finish();continue;}
    if(field==='DO')item.DOI=value;
    if(field==='TI'||field==='T1')item.title=value;
    if(field==='UR')item.url=value;
    if(field==='N1'&&/PMID\s*:/i.test(value))item.extra=value;
    if(field==='AN'&&/^\d{3,12}$/.test(value))item.pmid=value;
    last=field==='TI'||field==='T1'?'title':field==='DO'?'DOI':field==='UR'?'url':'';
  }
  if(Object.keys(item).length)finish();
  return {keys:[...keys],count};
}
const risText=value=>String(value||'').replace(/[\r\n]+/g,' ').trim();
export function asRIS(items) {
  return items.map(a=>['TY  - JOUR','TI  - '+risText(a.title),...a.authors.map(x=>'AU  - '+risText(x)),
    ...(a.journal?['JO  - '+risText(a.journal)]:[]),
    ...(a.year?['PY  - '+a.year]:[]),...(a.doi?['DO  - '+a.doi]:[]),
    ...(a.url?['UR  - '+a.url]:[]),...(a.abstract?['AB  - '+risText(a.abstract)]:[]),'ER  - '
  ].join('\r\n')).join('\r\n\r\n');
}
function csvCell(value) {
  let s=String(value??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function asCSV(items) {
  const columns=['title','authors','journal','year','date','doi','pmid','source','url','pdf','topic','abstract'];
  return [columns.map(csvCell).join(','),...items.map(a=>columns.map(k=>csvCell(k==='authors'?a.authors.join('; '):a[k])).join(','))].join('\r\n');
}
export function zoteroItem(a,collection='') {
  return {itemType:'journalArticle',title:a.title,
    creators:a.authors.map(name=>{
      const parts=String(name).trim().split(/\s+/);
      return parts.length<2?{creatorType:'author',name}:{creatorType:'author',firstName:parts.slice(0,-1).join(' '),lastName:parts.at(-1)};
    }),
    publicationTitle:a.journal||'',date:a.date||String(a.year||''),DOI:a.doi||'',url:a.url||'',
    abstractNote:a.abstract||'',extra:a.pmid?'PMID: '+a.pmid:'',tags:[{tag:'Swipaper'},...(a.topic?[{tag:a.topic}]:[])],
    collections:collection?[collection]:[]
  };
}
