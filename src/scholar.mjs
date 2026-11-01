import {fingerprints} from './core.mjs';
export function scholarSearchUrl(query,period=0){
  const url=new URL('https://scholar.google.com/scholar');
  url.searchParams.set('q',String(query||'').trim());
  if(period>0&&Number.isInteger(period))url.searchParams.set('as_ylo',String(new Date().getUTCFullYear()-period));
  return url.toString();
}
function cleanBibValue(text){
  return String(text||'').trim().replace(/^\s*[\{\"]|[\}\"]\s*$/g,'').replace(/[{}]/g,'')
    .replace(/\s+/g,' ').trim();
}
// EndNote/RIS references are processed by risFingerprints. BibTeX exported by Scholar
// uses the usual @type{key, field={value}} blocks; tolerate nested braces.
export function bibtexFingerprints(source){
  const input=String(source||'');
  const records=[];
  let p=0;
  while(p<input.length){
    const marker=/@(?:article|book|inproceedings|conference|misc|phdthesis|mastersthesis|techreport|unpublished|proceedings)\s*[{(]/ig;
    marker.lastIndex=p;const m=marker.exec(input);
    if(!m)break;
    const open=marker.lastIndex-1,openChar=input[open],closeChar=openChar==='{'?'}':')';
    let depth=1,i=open+1,quoted=false,escaped=false;
    while(i<input.length&&depth>0){
      const c=input[i++];
      if(escaped){escaped=false;continue;}
      if(c==='\\'){escaped=true;continue;}
      if(c==='"'){quoted=!quoted;continue;}
      if(!quoted){if(c===openChar)depth++;if(c===closeChar)depth--;}
    }
    p=i;if(depth!==0)continue;
    const block=input.slice(open+1,i-1);
    const firstComma=block.indexOf(',');
    if(firstComma<0)continue;
    let fields=block.slice(firstComma+1);
    const obj={};
    const fieldPattern=/([a-z][a-z0-9_]*)\s*=/ig;let match;
    while((match=fieldPattern.exec(fields))){
      let at=fieldPattern.lastIndex;
      while(/\s/.test(fields[at]||''))at++;
      let raw='',start=at;
      if(fields[at]==='{'){
        let depth2=1;at++;
        for(;at<fields.length&&depth2;at++){
          if(fields[at]==='{')depth2++;
          else if(fields[at]==='}')depth2--;
          if(depth2)raw+=fields[at];
        }
      }else if(fields[at]==='"'){
        at++;
        for(;at<fields.length&&fields[at]!=='"';at++)raw+=fields[at];
        at++;
      }else{
        for(;at<fields.length&&fields[at]!==',';at++)raw+=fields[at];
      }
      obj[match[1].toLowerCase()]=cleanBibValue(raw);
      fieldPattern.lastIndex=Math.max(at,start+1);
    }
    if(obj.title||obj.doi||obj.url)records.push({title:obj.title,doi:obj.doi,url:obj.url,extra:obj.note||''});
  }
  const keys=new Set();
  for(const record of records)for(const fp of fingerprints(record))keys.add(fp);
  return {count:records.length,keys:[...keys]};
}

export function scholarProxyUrl(endpoint,query,cutoff,page=1){
 const url=new URL(endpoint);
 if(url.protocol!=='https:')throw new Error('Le serveur Scholar doit utiliser HTTPS.');
 if(url.username||url.password)throw new Error('URL avec identifiants refusée.');
 if(!url.pathname.endsWith('/api/scholar'))url.pathname=url.pathname.replace(/\/$/,'')+'/api/scholar';
 url.searchParams.set('q',String(query||'').trim());
 url.searchParams.set('from',String(cutoff));
 url.searchParams.set('page',String(page));
 return url.toString();
}
