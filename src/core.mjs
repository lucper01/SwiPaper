export function abstractFromIndex(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 10000) words[p] = word;
  }
  return words.map(w => w || '').join(' ').replace(/\s+/g, ' ').trim();
}
export function cleanDoi(value) {
  const doi = String(value || '').trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : '';
}
export function safeUrl(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function toArticle(work, topic = '') {
  const doi = cleanDoi(work.doi);
  const authors = (work.authorships || []).map(a => a.author?.display_name).filter(Boolean).slice(0, 20);
  const landing = safeUrl(work.best_oa_location?.landing_page_url || work.primary_location?.landing_page_url || work.id);
  const pdf = safeUrl(work.best_oa_location?.pdf_url || work.primary_location?.pdf_url || '');
  return {
    id: doi ? 'doi:' + doi.toLowerCase() : String(work.id || '').trim(),
    title: String(work.title || work.display_name || 'Sans titre'),
    abstract: abstractFromIndex(work.abstract_inverted_index),
    authors,
    journal: String(work.primary_location?.source?.display_name || work.best_oa_location?.source?.display_name || ''),
    year: Number(work.publication_year) || null,
    date: String(work.publication_date || ''),
    doi, url: doi ? 'https://doi.org/' + doi : landing, pdf,
    openAccess: !!(work.open_access?.is_oa || pdf), topic
  };
}
export function deduplicate(articles) {
  const seen = new Set();
  return articles.filter(a => {
    if (!a.id || seen.has(a.id)) return false;
    seen.add(a.id); return true;
  });
}
export function openAlexUrl(query, {days=365,perPage=50,page=1,key=''}={}) {
  const date = new Date(Date.now() - Math.max(1,days)*86400000).toISOString().slice(0,10);
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search',String(query).trim());
  url.searchParams.set('filter','from_publication_date:'+date+',has_abstract:true');
  url.searchParams.set('sort','publication_date:desc');
  url.searchParams.set('per_page',String(Math.min(Math.max(1,perPage),100)));
  url.searchParams.set('page',String(Math.max(1,page)));
  if (key) url.searchParams.set('api_key',key);
  return url.toString();
}
const risText = x => String(x || '').replace(/[\r\n]+/g,' ').trim();
export function asRIS(items) {
  return items.map(a => [
    'TY  - JOUR','TI  - '+risText(a.title),
    ...a.authors.map(x=>'AU  - '+risText(x)),
    ...(a.journal?['JO  - '+risText(a.journal)]:[]),
    ...(a.year?['PY  - '+a.year]:[]),
    ...(a.doi?['DO  - '+a.doi]:[]),
    ...(a.url?['UR  - '+a.url]:[]),
    ...(a.abstract?['AB  - '+risText(a.abstract)]:[]),
    'ER  - '
  ].join('\r\n')).join('\r\n\r\n');
}
function csvCell(value) {
  let s=String(value??'');
  if (/^\s*[=+\-@]/.test(s)) s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export function asCSV(items) {
  const columns=['title','authors','journal','year','date','doi','url','pdf','topic','abstract'];
  return [columns.map(csvCell).join(','),...items.map(a=>columns.map(k=>csvCell(k==='authors'?a.authors.join('; '):a[k])).join(','))].join('\r\n');
}
export function zoteroItem(a,collection='') {
  return {
    itemType:'journalArticle',title:a.title,
    creators:a.authors.map(name=>{
      const parts=String(name).trim().split(/\s+/);
      return parts.length<2?{creatorType:'author',name}:{creatorType:'author',firstName:parts.slice(0,-1).join(' '),lastName:parts.at(-1)};
    }),
    publicationTitle:a.journal||'',date:a.date||String(a.year||''),DOI:a.doi||'',url:a.url||'',abstractNote:a.abstract||'',
    tags:[{tag:'Swipaper'},...(a.topic?[{tag:a.topic}]:[])],
    collections:collection?[collection]:[]
  };
}
