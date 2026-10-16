// Formal Boolean search across scientific titles and abstracts.
// Explicit parentheses, AND, OR, NOT and quoted phrases. Adjacent words imply AND.
// No fallback from a failed expression to a broader keyword search.
const MAX_QUERY_LENGTH=400;
const MAX_TOKENS=100;
const OPERATORS=new Set(['AND','OR','NOT']);
export function tokenizeSearch(source) {
  const input=String(source||'').trim();
  if(!input||input.length>MAX_QUERY_LENGTH)throw new Error('La requête doit contenir entre 1 et 400 caractères.');
  const tokens=[];
  const scanner=/"(?:[^"\\]|\\.)*"|\(|\)|[^\s()"]+|"/g;
  let match;
  while((match=scanner.exec(input))){
    const raw=match[0];
    if(raw==='"')throw new Error('Guillemet non fermé dans la requête.');
    const isQuoted=raw.startsWith('"');
    if(isQuoted&&!raw.endsWith('"'))throw new Error('Phrase incomplète.');
    const value=isQuoted?raw.slice(1,-1).replace(/\\"/g,'"').trim():raw;
    if(!value)throw new Error('Un terme de recherche ne peut pas être vide.');
    const upper=value.toUpperCase();
    const type=raw==='('? 'LP':raw===')'?'RP':!isQuoted&&OPERATORS.has(upper)?upper:'TERM';
    if(type==='TERM'&&!/[\p{L}\p{N}]/u.test(value))throw new Error('Terme invalide : '+value);
    tokens.push({type,value});
    if(tokens.length>MAX_TOKENS)throw new Error('Requête trop longue : 100 éléments maximum.');
  }
  const compact=tokens.map(t=>t.type==='TERM'?(t.value.includes(' ')?'"'+t.value+'"':t.value):t.type==='LP'?'(':t.type==='RP'?')':t.type);
  return {tokens,display:compact.join(' ')};
}
export function parseScientificQuery(source){
  const {tokens}=tokenizeSearch(source);
  let at=0;
  const peek=()=>tokens[at]?.type;
  const take=()=>tokens[at++];
  function primary(){
    if(peek()==='LP'){
      take();const node=orExpr();
      if(peek()!=='RP')throw new Error('Parenthèse fermante manquante.');
      take();return node;
    }
    if(peek()==='TERM')return {op:'term',value:take().value};
    throw new Error('Il manque un mot-clé ou une phrase à la position '+(at+1)+'.');
  }
  function unary(){
    if(peek()==='NOT'){take();return {op:'not',child:unary()};}
    return primary();
  }
  function andExpr(){
    let left=unary();
    while(peek()==='AND'||peek()==='NOT'||peek()==='TERM'||peek()==='LP'){
      if(peek()==='AND')take();
      left={op:'and',left,right:unary()};
    }
    return left;
  }
  function orExpr(){
    let left=andExpr();
    while(peek()==='OR'){take();left={op:'or',left,right:andExpr()};}
    return left;
  }
  const tree=orExpr();
  if(at!==tokens.length)throw new Error('Syntaxe de recherche invalide près de '+(tokens[at]?.value||'la fin')+'.');
  const positives=[];
  const excluded=[];
  function visit(node,negative=false){
    if(node.op==='term'){(negative?excluded:positives).push(node.value);return;}
    if(node.op==='not'){visit(node.child,!negative);return;}
    visit(node.left,negative);visit(node.right,negative);
  }
  visit(tree);
  if(!positives.length)throw new Error('Ajoutez au moins un terme positif à votre recherche.');
  return {tree,positives:[...new Set(positives)],excluded:[...new Set(excluded)],display:source.trim()};
}
export function normalizeSearchText(value){
  return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}
function containsPhrase(haystack,value){
  const needle=normalizeSearchText(value);
  if(!needle)return false;
  return (' '+haystack+' ').includes(' '+needle+' ');
}
function truth(node,fields){
  if(node.op==='term')return fields.some(text=>containsPhrase(text,node.value));
  if(node.op==='not')return !truth(node.child,fields);
  return node.op==='and'?(truth(node.left,fields)&&truth(node.right,fields)):(truth(node.left,fields)||truth(node.right,fields));
}
// Scoring is descriptive keyword coverage, not a claimed machine-learning probability.
export function evaluateScientificArticle(article,parsed,scope='title_abstract'){
  const ast=typeof parsed==='string'?parseScientificQuery(parsed):parsed;
  const title=normalizeSearchText(article.title);
  const abstract=normalizeSearchText(article.abstract);
  const fields=scope==='title'?[title]:[title,abstract].filter(Boolean);
  if(!fields.length||!truth(ast.tree,fields))return {matches:false,score:0,matched:[],titleMatched:[]};
  const matched=ast.positives.filter(term=>fields.some(field=>containsPhrase(field,term)));
  const titleMatched=matched.filter(term=>containsPhrase(title,term));
  const count=ast.positives.length||1;
  const titleCoverage=titleMatched.length/count;
  const totalCoverage=matched.length/count;
  const score=Math.round(Math.min(100,50+25*totalCoverage+25*titleCoverage));
  return {matches:true,score,matched,titleMatched};
}
function emitBoolean(node,term){
  if(node.op==='term')return term(node.value);
  if(node.op==='not')return 'NOT ('+emitBoolean(node.child,term)+')';
  return '('+emitBoolean(node.left,term)+' '+node.op.toUpperCase()+' '+emitBoolean(node.right,term)+')';
}
export function compileScientificQuery(source,provider='openalex',scope='title_abstract'){
  const parsed=typeof source==='string'?parseScientificQuery(source):source;
  const safeScope=scope==='title'?'title':'title_abstract';
  if(provider==='openalex')return emitBoolean(parsed.tree,v=>/\s/.test(v)?'"'+v.replace(/"/g,'')+'"':v);
  if(provider==='europepmc'){
    const tag=safeScope==='title'?'TITLE':'TITLE_ABS';
    return emitBoolean(parsed.tree,v=>tag+':"'+v.replace(/"/g,'')+'"');
  }
  throw new Error('Source inconnue.');
}
export function themeScope(topic){return topic?.scope==='title'?'title':'title_abstract';}
