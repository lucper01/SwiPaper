import { toArticle, toEuropePMCArticle, deduplicate, openAlexUrl, europePmcUrl, cutoffFromPeriod, fingerprints, zoteroFingerprints, isFresh, asRIS, asCSV, risFingerprints, zoteroItem, resetLocalLibraryState, completeSourcePage } from './core.mjs';
import { parseScientificQuery, compileScientificQuery, evaluateScientificArticle, themeScope, normalizeSearchText } from './search.mjs';
import {openAlexWorkId,citationLookupUrl,citationNeighborsUrl,batchWorksUrl,buildCitationGraph,citationLayout,filterCitationGraph} from './citations.mjs';
import {bibtexFingerprints,scholarSearchUrl,scholarProxyUrl} from './scholar.mjs';

const STORAGE='swipaper-v1-state';
const TITLES={discover:'Découvrir',library:'Bibliothèque',topics:'Mes thématiques',history:'Historique',settings:'Paramètres',graph:'Réseau de citations'};
const DEFAULT={
  topics:[],
  library:{},seen:{},history:[],active:null,lastSummary:null,alerts:{lastCheck:null,known:[],unseen:[]},
  zoteroIndex:{user:'',syncedAt:null,keys:[],count:0},
  externalIndex:{importedAt:null,keys:[],count:0},
  prefs:{periodCount:3,periodUnit:'months',sources:['openalex','pubmed'],batch:20,zoteroUser:'',zoteroCollection:'',quickQuery:'',searchScope:'title_abstract',selectedTopicIds:[],scholarProxy:'',types:['article','review','preprint']}
};
let state=loadState();
if(!state.alerts||!Array.isArray(state.alerts.known))state.alerts={lastCheck:null,known:[],unseen:[]};
let alertLoading=false;
let syncingZotero=false;
let topicEditorId='';
let view=TITLES[location.hash.slice(1)]?location.hash.slice(1):'discover';
let libraryFilter='liked';
let loading=false;
let toastTimer;
let installing=null;
let swipeAnimationLocked=false;
let showCompletion=false;
let mobileFiltersOpen=false;
let searchError='';
let graphState={loading:false,data:null,error:'',selected:null,article:null,filters:{references:true,citing:true,related:true}};
const root=document.querySelector('#view');
const toastBox=document.querySelector('#toast');
const el=(id)=>document.getElementById(id);
const esc=(str)=>String(str??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2);
function loadState(){
  try {
    const data=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(data && Array.isArray(data.topics) && data.library && typeof data.library==='object') {
      const migrated=data.topics.filter(t=>!['topic-neuro','topic-multi'].includes(t.id));
      return {...structuredClone(DEFAULT),...data,topics:migrated,prefs:{...DEFAULT.prefs,...data.prefs},zoteroIndex:data.zoteroIndex||structuredClone(DEFAULT.zoteroIndex),externalIndex:data.externalIndex||structuredClone(DEFAULT.externalIndex)};
    }
  }catch(e){console.warn('Local state unavailable',e);}
  return structuredClone(DEFAULT);
}
function persist(){
  try {localStorage.setItem(STORAGE,JSON.stringify(state));}
  catch(e){showToast('Espace local saturé : exportez vos articles avant de poursuivre.');}
}
function showToast(message){
  clearTimeout(toastTimer);toastBox.textContent=message;toastBox.hidden=false;
  toastTimer=setTimeout(()=>toastBox.hidden=true,5500);
}
function pageIntro(label,title,description,extra=''){
  return '<div class="page-heading"><div><p class="eyebrow">'+esc(label)+'</p><h1 class="page-title">'+esc(title)+'</h1><p class="page-subtitle">'+esc(description)+'</p></div>'+extra+'</div>';
}
function btn(label,action,cls='secondary',attrs=''){
  return '<button type="button" class="btn '+cls+'" data-act="'+action+'" '+attrs+'>'+label+'</button>';
}
function empty(title,description,action='',label=''){
  const pose=view==='library'?'library':view==='graph'?'citations':view==='topics'?'thinking':'discover';
  return '<div class="empty"><img class="giraffe-variant empty-giraffe" src="./assets/giraffe-'+pose+'.svg" alt=""><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p>'+(action?btn(esc(label),action,'primary'):'')+'</div>';
}
function topicById(id){return state.topics.find(t=>t.id===id);}
function giraffeMascot(){
  return '<div class="giraffe-illustration" aria-hidden="true" title="La girafe accompagne vos décisions">'+
    '<svg class="giraffe-svg" viewBox="0 0 172 225" xmlns="http://www.w3.org/2000/svg" focusable="false">'+
    '<ellipse cx="88" cy="217" rx="51" ry="6" fill="#becbc0" opacity=".35"/>'+
    '<g class="giraffe-motion">'+
    '<path d="M72 216 C66 170 72 122 76 75 L108 74 C103 127 106 168 114 216Z" fill="#e7b85b" stroke="#ae7d3f" stroke-width="2.6"/>'+
    '<path d="M76 81C73 127 69 178 73 214L85 214C82 170 83 122 89 84Z" fill="#f7d98e" opacity=".8"/>'+
    '<g fill="#a66c3a" opacity=".92"><ellipse cx="98" cy="117" rx="10" ry="15" transform="rotate(18 98 117)"/><ellipse cx="80" cy="142" rx="7" ry="11" transform="rotate(-16 80 142)"/><ellipse cx="101" cy="177" rx="10" ry="13"/><ellipse cx="79" cy="200" rx="6" ry="9"/><ellipse cx="99" cy="85" rx="6" ry="8"/></g>'+
    '<path d="M71 77C58 69 54 59 59 49C66 42 77 51 82 61Z" fill="#eab960" stroke="#ae7d3f" stroke-width="2"/>'+
    '<path d="M111 72C126 67 131 58 126 48C117 42 107 53 102 62Z" fill="#eab960" stroke="#ae7d3f" stroke-width="2"/>'+
    '<path d="M66 51L72 37M102 49L109 35" stroke="#b47d41" stroke-width="5" stroke-linecap="round"/>'+
    '<circle cx="73" cy="36" r="5.2" fill="#956038"/><circle cx="109" cy="34" r="5.2" fill="#956038"/>'+
    '<path d="M61 63Q62 39 86 38Q114 37 119 66L115 87Q108 105 90 105Q64 101 61 82Z" fill="#e7b85b" stroke="#ae7d3f" stroke-width="2.5"/>'+
    '<path d="M64 80Q89 75 113 81Q120 99 109 105L84 108Q61 103 64 80Z" fill="#f6dba5" stroke="#ae7d3f" stroke-width="1.7"/>'+
    '<ellipse cx="77" cy="66" rx="4.7" ry="6.2" fill="#3d4335"/><circle cx="79" cy="64" r="1.6" fill="#fff"/>'+
    '<ellipse cx="107" cy="65" rx="4.7" ry="6.2" fill="#3d4335"/><circle cx="109" cy="63" r="1.6" fill="#fff"/>'+
    '<circle cx="76" cy="92" r="3" fill="#ae7d3f"/><circle cx="105" cy="92" r="3" fill="#ae7d3f"/>'+
    '<path d="M86 96Q94 101 100 95" stroke="#976744" stroke-width="2.4" stroke-linecap="round" fill="none"/>'+
    '<circle cx="63" cy="83" r="5" fill="#d98c80" opacity=".55"/><circle cx="117" cy="83" r="5" fill="#d98c80" opacity=".55"/>'+
    '</g></svg></div>';
}
function counts(actions=[]){
  return {liked:actions.filter(x=>x.decision==='liked').length,later:actions.filter(x=>x.decision==='later').length,rejected:actions.filter(x=>x.decision==='rejected').length};
}
function saveAndRender(){persist();render();}
// Automatic citation and alert updates must never discard a search the user is typing.
function refreshAfterBackgroundUpdate(){
  const input=el('quick-query');
  if(view==='discover'&&input&&input.value!==String(state.prefs.quickQuery||''))return;
  render();
}
function render(){
  el('breadcrumb').textContent=TITLES[view];
  document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===view));
  el('saved-count').textContent=Object.values(state.library).filter(x=>x.status==='liked').length;
  root.classList.toggle('session-layout',view==='discover'&&!!state.active);
  if(view==='discover')renderDiscover();
  if(view==='library')renderLibrary();
  if(view==='topics')renderTopics();
  if(view==='history')renderHistory();
  if(view==='settings')renderSettings();
  if(view==='graph')renderGraph();
}
function navigate(next){
  if(!TITLES[next])return;
  // The completion screen is shown once. Revisiting Discover opens a new search.
  if(next==='discover'||view==='discover')showCompletion=false;
  view=next;location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});
}
function updateQuickQueryFeedback(){
  const textarea=el('quick-query'),feedback=el('quick-feedback');
  if(!textarea||!feedback)return;
  const value=textarea.value.trim();
  if(!value){feedback.className='search-feedback';feedback.textContent='Ajoutez vos mots-clés ou sélectionnez une thématique. Les critères sont vérifiés dans chaque article.';return;}
  try{
    const parsed=parseScientificQuery(value);
    feedback.className='search-feedback valid';
    feedback.textContent='✓ Requête valide · '+parsed.positives.length+' critère(s) · '+parsed.excluded.length+' exclusion(s) · contrôle strict des résultats';
  }catch(error){feedback.className='search-feedback invalid';feedback.textContent='✕ '+error.message;}
}

function researchForm(){
  const prefs=state.prefs;
  const selectedTopics=Array.isArray(prefs.selectedTopicIds)?prefs.selectedTopicIds:[];
  const sources=Array.isArray(prefs.sources)?prefs.sources:['openalex','pubmed'];
  const kinds=Array.isArray(prefs.types)?prefs.types:['article','review','preprint'];
  const topics=state.topics.map(t=>'<label class="check-chip"><input type="checkbox" name="topic" value="'+esc(t.id)+'" '+(selectedTopics.includes(t.id)?'checked':'')+'><span>'+esc(t.name)+'</span></label>').join('');
  return '<section class="research-panel" aria-label="Recherche scientifique"><div class="pane-title-row"><h2>Rechercher des articles</h2><span class="meta-hint">Recherche</span></div>'+
    (searchError?'<div class="search-error" role="alert"><strong>Recherche non aboutie</strong><p>'+esc(searchError)+'</p></div>':'')+
  '<form id="session-form" class="form-stack">'+
  '<div class="field"><label for="quick-query">Mots-clés</label><div class="query-editor"><textarea id="quick-query" name="quickQuery" rows="2" maxlength="400" spellcheck="false" placeholder="Ex. olfactory perception, visual attention" aria-describedby="quick-feedback">'+esc(prefs.quickQuery||'')+'</textarea>'+
  '<button class="query-submit" type="submit" aria-label="Lancer la recherche" '+(loading?'disabled':'')+'>⌕</button></div><div id="quick-feedback" class="search-feedback" role="status" aria-live="polite"></div>'+
  '<div class="starter-examples"><span>Exemples</span>'+[['olfactory perception','Olfaction'],['visual attention','Attention'],['working memory','Mémoire']].map(([query,label])=>'<button type="button" class="example-chip" data-act="try-example" data-query="'+esc(query)+'">'+esc(label)+'</button>').join('')+'</div></div>'+
  (state.topics.length?'<div class="field"><label>Thématiques enregistrées (facultatif)</label><div class="check-list">'+topics+'</div>'+
   '<small>Une requête saisie s’ajoute aux thématiques sélectionnées.</small></div>':
   '<p class="tiny muted intro-hint">Vous pouvez chercher sans créer de thématique. <button type="button" data-act="go-topics" class="text-btn">Enregistrer une thématique</button></p>')+
  '<div class="form-row simple-options"><div class="field"><label for="period-count">Publiés depuis moins de</label><div class="form-row" style="grid-template-columns:1fr 1.25fr;gap:7px">'+
  '<input id="period-count" name="periodCount" type="number" min="1" max="3650" required value="'+esc(prefs.periodCount||3)+'">'+
  '<select name="periodUnit" aria-label="Unité de période">'+[['days','jours'],['months','mois'],['years','années']].map(([v,t])=>'<option value="'+v+'" '+(prefs.periodUnit===v?'selected':'')+'>'+t+'</option>').join('')+'</select></div></div>'+
  '<div class="field"><label for="batch-size">Articles par session</label><select id="batch-size" name="batch">'+[10,20,30,50].map(n=>'<option value="'+n+'" '+(prefs.batch===n?'selected':'')+'>'+n+' publications</option>').join('')+'</select></div></div>'+
  '<button class="btn search-cta" type="submit" '+(loading?'disabled':'')+'>'+(loading?'<span class="loading"></span> Recherche en cours…':'Rechercher les articles')+'</button>'+
  '<details class="advanced-filters"><summary>Affiner la recherche <span>Sources, opérateurs logiques et types d’articles</span></summary>'+
  '<div class="advanced-filters-inner"><div class="field"><label>Opérateurs booléens</label><div class="query-tools">'+['AND','OR','NOT','(',')','"phrase"'].map(t=>'<button type="button" class="query-token" data-act="insert-token" data-token="'+esc(t)+'">'+esc(t)+'</button>').join('')+'</div>'+
  '<small>Sans opérateur, tous les mots sont requis. AND = ensemble, OR = alternative, NOT = exclusion, "..." = expression exacte.</small></div>'+
  '<div class="form-section"><h3>Zone de recherche</h3><label class="article-type-check"><input type="radio" name="searchScope" value="title_abstract" '+(prefs.searchScope!=='title'?'checked':'')+'> Titre et résumé</label><label class="article-type-check"><input type="radio" name="searchScope" value="title" '+(prefs.searchScope==='title'?'checked':'')+'> Titre uniquement</label></div>'+
  '<div class="form-section"><h3>Bases bibliographiques</h3><div class="source-options"><label class="source-switch"><input type="checkbox" name="source" value="openalex" '+(sources.includes('openalex')?'checked':'')+'> OpenAlex</label><label class="source-switch"><input type="checkbox" name="source" value="pubmed" '+(sources.includes('pubmed')?'checked':'')+'> PubMed / Europe PMC</label>'+ (prefs.scholarProxy?'<label class="source-switch"><input type="checkbox" name="source" value="scholar" '+(sources.includes('scholar')?'checked':'')+'> Google Scholar via serveur</label>':'')+'</div>'+(prefs.scholarProxy?'':'<small>Source Scholar directe : à configurer dans Paramètres.</small>')+'</div>'+
  '<div class="form-section"><h3>Types de publication</h3><label class="article-type-check"><input type="checkbox" name="kind" value="article" '+(kinds.includes('article')?'checked':'')+'> Articles</label><label class="article-type-check"><input type="checkbox" name="kind" value="review" '+(kinds.includes('review')?'checked':'')+'> Revues / méta-analyses</label><label class="article-type-check"><input type="checkbox" name="kind" value="preprint" '+(kinds.includes('preprint')?'checked':'')+'> Prépublications</label></div>'+
  '<p class="tiny muted">Les critères sont vérifiés sur chaque article avant qu’il soit proposé.</p></div></details>'+
  '<div class="button-row research-tools">'+
  '<button type="button" class="btn secondary small" data-act="scholar-search">Rechercher dans Google Scholar ↗</button>'+
  '<button type="button" class="btn secondary small" data-act="scholar-import">Importer une sélection Scholar</button></div>'+
  '<div class="search-meta-row"><span>Les articles déjà traités sont exclus.</span><button type="button" data-act="clear-quick-search" class="text-btn">Effacer les filtres</button></div>'+
  (prefs.zoteroUser?'<p class="tiny muted">Zotero lié : comparaison avant chaque recherche.</p>':'<p class="tiny muted">Pour exclure les articles de Zotero, <button type="button" data-act="go-settings" class="text-btn">connectez votre bibliothèque</button>.</p>')+
  '</form></section>';
}
function discoveryHero(){
  return '<div class="discover-hero"><p class="eyebrow">RECHERCHE SCIENTIFIQUE</p><h1>Rechercher et sélectionner des publications</h1>'+
  '<p>Précisez vos sujets, consultez les résumés et classez les articles selon leur pertinence.</p></div>';
}
function setup(){
  const news=(state.alerts?.unseen||[]).length;
  return discoveryHero()+
  '<div class="discover-workspace">'+researchForm()+
  '<section class="result-panel"><div class="pane-title-row"><h2>Votre prochaine découverte</h2><span class="meta-hint">✧ À vous de swiper</span></div>'+
  '<div class="preview-placeholder"><img src="./assets/giraffe-discover.svg" alt="Girafe avec une loupe">'+
  '<h3>Les articles apparaîtront ici</h3><p>Saisissez vos mots-clés, choisissez une période et lancez la recherche.</p>'+
  '<button class="btn secondary small" data-act="go-topics" type="button">⌕ Mes thématiques</button></div>'+
  (news?'<div class="pill-note" style="margin-top:12px">✧ '+news+' nouvelle(s) publication(s) détectée(s) dans vos thématiques. <button type="button" data-act="check-alerts" class="text-btn">Actualiser ↻</button></div>':'')+
  '</section></div>';
}
function paperCard(a){
  const authors=a.authors.slice(0,4).join(', ')+(a.authors.length>4?' et al.':'');
  return '<article class="paper-card" id="swipe-card" aria-label="Publication : '+esc(a.title)+'">'+
    '<div class="card-top"><span class="tag">'+esc(a.topic||'Publication')+'</span><span class="tag alt">'+esc(a.year||'Année inconnue')+'</span><span class="tag alt">'+esc(a.kind==='preprint'?'Prépublication':a.kind==='review'?'Revue / synthèse':'Article')+'</span>'+(a.openAccess?'<span class="tag">✓ Accès ouvert</span>':'')+'</div>'+
    '<div class="paper-topline"><span>YOUR NEXT RESEARCH MATCH</span><span>♥</span></div><h2>'+esc(a.title)+'</h2><p class="authors">'+esc(authors||'Auteurs non renseignés')+'</p><p class="journal">'+esc(a.journal||'Source scientifique')+' '+(a.date?' · '+esc(a.date):'')+' · '+esc(a.source||'Base scientifique')+'</p>'+ 
    '<div class="match-summary"><span class="match-score">'+(Number.isFinite(a.relevanceScore)?a.relevanceScore+'/100':'Recherche vérifiée')+'</span><div><strong>Correspondance vérifiée</strong><small>'+esc((a.scope==='title'?'Dans le titre':'Dans le titre ou le résumé')+' · '+(a.matchingTerms?.length||0)+' terme(s) trouvé(s)')+'</small></div></div><hr>'+
    '<p class="muted-label">LE RÉSUMÉ</p><p class="abstract">'+esc(a.abstract||'Résumé indisponible.')+'</p>'+
    '<div class="matched-chips">'+(a.matchingTerms||[]).slice(0,6).map(term=>'<span class="matched-chip">✓ '+esc(term)+'</span>').join('')+'</div>'+
    '<div class="paper-links">'+btn('◎ Citations','graph-current','secondary small')+(a.doi?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">↗ DOI</a>':'')+
    (a.url&&!a.doi?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">↗ Article</a>':'')+
    (a.pdf?'<a href="'+esc(a.pdf)+'" target="_blank" rel="noopener noreferrer">↗ PDF disponible</a>':'')+'</div></article>';
}
function renderDiscover(){
  // Protect startup if an interrupted older release stored an incomplete session.
  if(state.active&&(!Array.isArray(state.active.articles)||!Array.isArray(state.active.actions)||
     !Number.isInteger(state.active.index)||state.active.index<0)){
    state.active=null;
    persist();
    showToast('La session précédente était incomplète. Vous pouvez lancer une nouvelle recherche.');
  }
  if(!state.active){root.classList.remove('session-layout');root.innerHTML=showCompletion&&state.lastSummary?endScreen(state.lastSummary):setup();updateQuickQueryFeedback();return;}
  const sess=state.active;
  const article=sess.articles[sess.index];
  if(!article){finishSession();return;}
  const c=counts(sess.actions);
  const percent=Math.round(sess.index/sess.articles.length*100);
  root.innerHTML=discoveryHero()+
    '<div class="discover-workspace has-active '+(mobileFiltersOpen?'filters-open':'')+'">'+
    researchForm()+
    '<section class="result-panel"><div class="pane-title-row"><h2>Votre match scientifique</h2><span class="meta-hint">'+(sess.index+1)+' / '+sess.articles.length+'</span></div>'+
    '<div class="button-row" style="justify-content:space-between;margin:7px 0 12px">'+
    btn('◫ Afficher les filtres','toggle-search-pane','secondary small')+
    '<div class="button-row">'+btn('↶ Annuler','undo','secondary small',sess.actions.length?'':'disabled')+btn('Terminer','finish','ghost small')+'</div></div>'+
    '<div class="progress-wrap"><strong>Article '+(sess.index+1)+' sur '+sess.articles.length+'</strong><span>'+percent+' % parcourus</span></div>'+
    '<div class="progress"><div style="width:'+percent+'%"></div></div>'+
    '<div class="swipe-scene" id="swipe-scene"><div class="paper-stack">'+paperCard(article)+'</div>'+
    '<div class="giraffe-control-row">'+giraffeMascot()+'</div></div>'+
    '<div class="swipe-actions">'+
    '<div class="swipe-control"><button class="circle-btn reject" data-act="reject" aria-label="Pas intéressant" title="Passer (flèche gauche)">✕</button><span>PASSER</span></div>'+
    '<div class="swipe-control"><button class="circle-btn hold" data-act="later" aria-label="À lire plus tard" title="Plus tard (flèche bas)">♧</button><span>PLUS TARD</span></div>'+
    '<div class="swipe-control"><button class="circle-btn like" data-act="like" aria-label="Conserver" title="Garder (flèche droite)">♥</button><span>GARDER</span></div>'+
    '</div><p class="swipe-help">← Passer · ↓ Plus tard · → Garder · Retour arrière : annuler</p>'+
    '<div class="search-session-meta"><div><strong>'+c.liked+'</strong><small>Articles conservés</small></div><div><strong>'+c.later+'</strong><small>À relire plus tard</small></div></div>'+
    '</section></div>';
  updateQuickQueryFeedback();
  attachSwipe();
}
function giraffeNeckElement(){
  return document.querySelector('#swipe-scene .giraffe-motion');
}
function tiltGiraffe(angle,animate=false){
  const neck=giraffeNeckElement();
  if(!neck)return;
  // Use the SVG viewport's neck base as an explicit pivot. This is more
  // reliable for desktop SVG than relying on a CSS variable alone.
  neck.style.transformOrigin='90px 216px';
  neck.style.transformBox='view-box';
  neck.style.animation='none';
  const deg=Math.max(-52,Math.min(52,angle));
  if(animate&&typeof neck.animate==='function'){
    neck.style.transition='none';
    neck.animate([
      {transform:neck.style.transform||'rotate(0deg)',offset:0},
      {transform:'rotate('+deg+'deg)',offset:.58},
      {transform:'rotate('+(deg*.83)+'deg)',offset:1}
    ],{duration:520,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});
  }else{
    neck.style.transition=animate?'transform .52s ease-out':'transform .09s linear';
    neck.style.transform='rotate('+deg+'deg)';
  }
}
function animatedDecision(decision){
  if(swipeAnimationLocked||!state.active)return;
  if(!['liked','rejected','later'].includes(decision))return;
  const scene=el('swipe-scene');
  if(!scene){decide(decision);return;}
  swipeAnimationLocked=true;
  scene.classList.add(decision==='liked'?'swipe-to-right':decision==='rejected'?'swipe-to-left':'swipe-to-later');
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
  tiltGiraffe(decision==='liked'?50:decision==='rejected'?-50:12,!reduced);
  document.querySelectorAll('.swipe-actions button').forEach(button=>button.disabled=true);
  const id=state.active.id;
  const index=state.active.index;
  window.setTimeout(()=>{
    swipeAnimationLocked=false;
    if(state.active?.id===id && state.active.index===index)decide(decision);
  },reduced?180:520);
}
function decide(decision){
  const s=state.active;
  if(!s||s.index>=s.articles.length)return;
  const a=s.articles[s.index];
  const previous=state.library[a.id]||null;
  const keys=fingerprints(a);
  const priorSeenEntries=keys.map(key=>[key,state.seen[key]||null]);
  s.actions.push({decision,article:a,previous,priorSeenEntries});
  for(const key of keys)state.seen[key]=new Date().toISOString();
  if(decision==='liked'||decision==='later') state.library[a.id]={article:a,status:decision,updated:new Date().toISOString()};
  else delete state.library[a.id];
  s.index++;
  persist();
  if(s.index>=s.articles.length)finishSession();else render();
}
function undo(){
  if(swipeAnimationLocked)return;
  const s=state.active;
  if(!s||!s.actions.length)return;
  const action=s.actions.pop();
  s.index=Math.max(0,s.index-1);
  if(action.previous)state.library[action.article.id]=action.previous;else delete state.library[action.article.id];
  for(const [key,date] of (action.priorSeenEntries||[[action.article.id,action.priorSeen||null]])){
    if(date)state.seen[key]=date;else delete state.seen[key];
  }
  saveAndRender();
}
function finishSession(){
  const s=state.active;if(!s)return;
  const summary={id:s.id,started:s.started,ended:new Date().toISOString(),actions:s.actions,planned:s.articles.length};
  state.history.unshift(summary);
  state.history=state.history.slice(0,60);
  state.active=null;
  state.lastSummary=summary;
  showCompletion=true;
  saveAndRender();
}
function endScreen(s){
  const c=counts(s.actions);
  return pageIntro('SESSION TERMINÉE','Bilan de sélection','Résumé des publications examinées.')+
    '<div class="end-card"><img class="giraffe-variant finish-giraffe" src="./assets/giraffe-success.svg" alt=""><p class="eyebrow" style="color:#b5d5b8">RÉCAPITULATIF</p><h2 class="page-title">Session terminée.</h2><p class="page-subtitle">Vos décisions sont sauvegardées dans votre bibliothèque et votre historique.</p>'+
    '<div class="end-stats"><div><strong>'+s.actions.length+'</strong><small>Parcourus</small></div><div><strong>'+c.liked+'</strong><small>Intéressants</small></div><div><strong>'+c.later+'</strong><small>À revoir</small></div><div><strong>'+c.rejected+'</strong><small>Écartés</small></div></div>'+
    '<div class="end-actions">'+btn('Nouvelle session','reset-summary','primary')+btn('Exporter en RIS','export-last-ris','secondary')+btn('Récap par e-mail','email-last','secondary')+btn('Envoyer vers Zotero','zotero-last','secondary')+'</div></div>'+
    '<div class="spacer"></div><div class="pill-note">L’e-mail s’ouvre dans votre application de messagerie pour validation. L’envoi automatique sera disponible dans une future version.</div>';
}
async function syncZoteroLibrary({silent=false}={}){
  if(syncingZotero)throw new Error('Une synchronisation Zotero est déjà en cours.');
  const user=String(state.prefs.zoteroUser||'').trim();
  const key=sessionStorage.getItem('swipaper-zotero')||'';
  if(!user)return;
  if(!/^\d+$/.test(user))throw new Error('Identifiant Zotero invalide.');
  if(!key)throw new Error('Clé Zotero absente : renseignez-la dans Paramètres pour filtrer votre bibliothèque.');
  syncingZotero=true;
  let count=0,finished=false;
  const keys=new Set();
  try{
    for(let start=0;start<15000;start+=100){
      const url='https://api.zotero.org/users/'+encodeURIComponent(user)+'/items/top?limit=100&start='+start+'&format=json';
      const response=await fetch(url,{
        headers:{'Zotero-API-Version':'3','Zotero-API-Key':key,Accept:'application/json'}
      });
      if(!response.ok)throw new Error('Lecture Zotero HTTP '+response.status+'. Vérifiez la clé API et ses permissions.');
      const rows=await response.json();
      if(!Array.isArray(rows))throw new Error('Réponse Zotero inattendue.');
      for(const item of rows){
        if(['attachment','note','annotation'].includes(item?.data?.itemType))continue;
        count++;
        for(const fp of zoteroFingerprints(item))keys.add(fp);
      }
      if(rows.length<100){finished=true;break;}
    }
    if(!finished)throw new Error('Bibliothèque de plus de 15 000 entrées : synchronisation incomplète. Aucun filtrage Zotero ne sera annoncé.');
    state.zoteroIndex={user,keys:[...keys],count,syncedAt:new Date().toISOString()};
    persist();
    if(!silent)showToast(count+' références Zotero synchronisées. Les articles correspondants seront ignorés.');
  }finally{syncingZotero=false;refreshAfterBackgroundUpdate();}
}

function localFingerprints() {
  const fp=new Set(Object.keys(state.seen||{}));
  for(const entry of Object.values(state.library||{}))for(const key of fingerprints(entry.article))fp.add(key);
  // Identifiants hérités de la première version.
  for(const key of Object.keys(state.seen||{}))if(!key.startsWith('id:'))fp.add(key);
  return [...fp];
}
async function fetchSource(topic,source,cutoff,page,key,kinds=['article','review','preprint']) {
  const isPubmed=source==='pubmed';
  const parsed=parseScientificQuery(topic.query);
  if(source==='scholar'){
    const endpoint=state.prefs.scholarProxy;
    const token=sessionStorage.getItem('swipaper-scholar-token')||'';
    if(!endpoint||!token)throw Error('Serveur Google Scholar non configuré.');
    const response=await fetch(scholarProxyUrl(endpoint,topic.query,cutoff,page),{headers:{'X-Swipaper-Token':token,Accept:'application/json'}});
    if(!response.ok)throw Error('Serveur Scholar HTTP '+response.status);
    const payload=await response.json();
    const rows=(payload.results||[]).filter(r=>r.title).slice(0,10);
    const results=await Promise.allSettled(rows.map(async row=>{
      const url=openAlexUrl(row.title,{cutoff,perPage:5,page:1,key,scope:'title'});
      const r=await fetch(url,{headers:{Accept:'application/json'}});
      if(!r.ok)throw Error('Métadonnées OpenAlex HTTP '+r.status);
      const data=await r.json(),target=normalizeSearchText(row.title);
      const raw=(data.results||[]).find(w=>normalizeSearchText(w.title||w.display_name)===target);
      if(!raw)return null;
      const article=toArticle(raw,topic.name);
      const type=String(raw.type||raw.type_crossref||'').toLowerCase();
      article.kind=/preprint|posted.content/.test(type)?'preprint':/review|meta.analysis/.test(type)?'review':'article';
      article.source='Google Scholar / OpenAlex';
      if(!article.date||article.abstract.length<=35||!kinds.includes(article.kind))return null;
      const relevance=evaluateScientificArticle(article,parsed,themeScope(topic));
      return relevance.matches?{...article,relevanceScore:relevance.score,matchingTerms:relevance.matched,titleTerms:relevance.titleMatched,scope:themeScope(topic)}:null;
    }));
    return completeSourcePage(rows,results.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value),10);
  }
  const scope=themeScope(topic);
  const query=compileScientificQuery(parsed,isPubmed?'europepmc':'openalex',scope);
  const url=isPubmed?europePmcUrl(query,{cutoff,page,pageSize:75})
    :openAlexUrl(query,{cutoff,page,perPage:75,key,scope});
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error((isPubmed?'Europe PMC':'OpenAlex')+' HTTP '+response.status);
  const data=await response.json();
  const rawRecords=isPubmed?(data.resultList?.result||[]):(data.results||[]);
  const records=isPubmed?rawRecords.map(w=>{
      const a=toEuropePMCArticle(w,topic.name);
      const publicationTypes=(w.pubTypeList?.pubType||[]).join(' ').toLowerCase();
      const kind=w.source==='PPR'?'preprint':/review|meta.analysis|systematic/.test(publicationTypes)?'review':'article';
      return {...a,kind};
    }):rawRecords.map(w=>{
      const a=toArticle(w,topic.name);
      const classification=String(w.type||w.type_crossref||'').toLowerCase();
      const kind=/preprint|posted.content/.test(classification)?'preprint':/review|meta.analysis/.test(classification)?'review':'article';
      return {...a,kind};
    });
  const matching=records.filter(a=>a.abstract.length>35&&a.date&&a.url&&kinds.includes(a.kind)).flatMap(a=>{
    const assessment=evaluateScientificArticle(a,parsed,scope);
    return assessment.matches?[{...a,relevanceScore:assessment.score,matchingTerms:assessment.matched,titleTerms:assessment.titleMatched,scope}]:[];
  });
  return completeSourcePage(rawRecords,matching,75);
}
async function startSession(form){
  if(loading)return;
  searchError='';
  const fd=new FormData(form);
  const ids=fd.getAll('topic');
  const sources=fd.getAll('source').filter(v=>['openalex','pubmed','scholar'].includes(v));
  const kinds=fd.getAll('kind').filter(v=>['article','review','preprint'].includes(v));
  const quickQuery=String(fd.get('quickQuery')||'').trim();
  const scope=String(fd.get('searchScope')||'title_abstract');
  let selected=ids.map(topicById).filter(Boolean);
  if(!['title','title_abstract'].includes(scope)){showToast('Zone de recherche invalide.');return;}
  if(quickQuery){
    try{parseScientificQuery(quickQuery);}catch(error){showToast('Erreur de logique : '+error.message);return;}
    selected=selected.length?selected.map(t=>({...t,query:'('+t.query+') AND ('+quickQuery+')',scope})):
      [{id:'quick',name:'Recherche personnalisée',query:quickQuery,scope}];
  }
  if(!selected.length){showToast('Saisissez une requête ou sélectionnez au moins une thématique enregistrée.');return;}
  if(!sources.length){showToast('Sélectionnez au moins une base bibliographique.');return;}
  if(!kinds.length){showToast('Sélectionnez au moins un type d’article.');return;}
  if(sources.includes('scholar')&&(!state.prefs.scholarProxy||!sessionStorage.getItem('swipaper-scholar-token'))){
    showToast('Google Scholar : configurez le serveur et son jeton dans les paramètres.');return;
  }
  for(const t of selected){try{parseScientificQuery(t.query);}catch(error){showToast(t.name+' : '+error.message);return;}}
  if(state.active&&!confirm('Remplacer la session en cours ? Les articles déjà traités resteront sauvegardés.'))return;
  const batch=Math.min(50,Math.max(10,Number(fd.get('batch'))||20));
  const periodCount=Number(fd.get('periodCount'));
  const periodUnit=String(fd.get('periodUnit')||'days');
  let cutoff;
  try{cutoff=cutoffFromPeriod(periodCount,periodUnit);}catch(error){showToast(error.message);return;}
  state.prefs.batch=batch;state.prefs.periodCount=periodCount;
  state.prefs.periodUnit=periodUnit;state.prefs.sources=sources;state.prefs.types=kinds;
  state.prefs.quickQuery=quickQuery;state.prefs.searchScope=scope;state.prefs.selectedTopicIds=ids;persist();
  loading=true;render();
  const errors=[];
  try{
    // Toujours synchroniser l'intégralité du Zotero lié avant d'annoncer qu'un article est nouveau.
    if(state.prefs.zoteroUser)await syncZoteroLibrary({silent:true});
    const zotero=[...(state.prefs.zoteroUser?state.zoteroIndex.keys:[]),...(state.externalIndex?.keys||[])];
    const seen=localFingerprints();
    const key=sessionStorage.getItem('swipaper-openalex')||'';
    const pools=selected.flatMap(topic=>sources.map(source=>({topic,source,articles:[],exhausted:false})));
    for(let page=1;page<=5;page++){
      const active=pools.filter(p=>!p.exhausted);
      if(!active.length)break;
      const results=await Promise.allSettled(active.map(async p=>fetchSource(p.topic,p.source,cutoff,page,key,kinds)));
      results.forEach((result,i)=>{
        if(result.status==='rejected'){
          errors.push(active[i].topic.name+' / '+active[i].source+' : '+(result.reason?.message||'Erreur réseau'));
          active[i].exhausted=true;
        }else{
          active[i].articles.push(...result.value.articles);
          if(!result.value.hasMore)active[i].exhausted=true;
        }
      });
      const fresh=deduplicate(pools.flatMap(p=>p.articles).sort((a,b)=>b.date.localeCompare(a.date)||b.relevanceScore-a.relevanceScore))
        .filter(a=>isFresh(a,{cutoff,seen,zotero}));
      if(fresh.length>=batch||results.every(r=>r.status==='rejected'))break;
    }
    if(pools.every(p=>p.articles.length===0)){
      throw new Error('Toutes les sources sont indisponibles. '+errors.join(' ; '));
    }
    const merged=deduplicate(pools.flatMap(p=>p.articles).sort((a,b)=>b.date.localeCompare(a.date)||b.relevanceScore-a.relevanceScore))
      .filter(a=>isFresh(a,{cutoff,seen,zotero})).slice(0,batch);
    if(!merged.length)throw new Error('Aucun article inédit avec résumé pour cette période : élargissez-la ou changez les mots-clés.');
    state.active={id:uid(),started:new Date().toISOString(),articles:merged,index:0,actions:[],cutoff,sources,query:quickQuery};mobileFiltersOpen=false;
    window.scrollTo({top:0,behavior:'instant'});
    state.lastSummary=null;persist();
    if(errors.length)showToast('Résultats partiels : '+errors[0]);
  }catch(error){searchError=error.message;showToast('Recherche impossible : '+error.message);}
  finally{loading=false;render();}
}
function attachSwipe(){
  const card=el('swipe-card');if(!card)return;
  const scene=el('swipe-scene');
  tiltGiraffe(0);
  let pointer=null;
  card.addEventListener('pointerdown',event=>{
    if(event.target.closest('a,button,input,select,textarea,[data-act]')||(event.pointerType==='mouse'&&event.target.closest('.abstract')))return;
    if(event.pointerType==='mouse'&&event.button!==0)return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dx:0,dy:0};
    card.classList.add('dragging');
    try{card.setPointerCapture(event.pointerId);}catch{}
  });
  card.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    pointer.dx=event.clientX-pointer.x;pointer.dy=event.clientY-pointer.y;
    if(Math.abs(pointer.dx)>12&&Math.abs(pointer.dx)>Math.abs(pointer.dy)){
      card.style.transform='translateX('+Math.max(-170,Math.min(170,pointer.dx))+'px) rotate('+(pointer.dx/27)+'deg)';
      tiltGiraffe(Math.max(-48,Math.min(48,pointer.dx*.32)));
    }
  });
  function end(event){
    if(!pointer||event.pointerId!==pointer.id)return;
    const dx=pointer.dx,dy=pointer.dy;
    pointer=null;card.classList.remove('dragging');card.style.transform='';
    if(Math.abs(dx)>95&&Math.abs(dx)>Math.abs(dy)*1.3)animatedDecision(dx>0?'liked':'rejected');
    else tiltGiraffe(0);
  }
  card.addEventListener('pointerup',end);
  card.addEventListener('pointercancel',()=>{pointer=null;card.style.transform='';card.classList.remove('dragging');tiltGiraffe(0);});
}
async function checkNewPapers(manual=false) {
  if(alertLoading||!navigator.onLine)return;
  if(!state.topics.length){if(manual)showToast('Créez une thématique pour lancer la veille.');return;}
  const last=state.alerts.lastCheck?Date.parse(state.alerts.lastCheck):0;
  if(!manual&&Date.now()-last<24*3600*1000)return;
  alertLoading=true;if(manual)render();
  try{
    if(state.prefs.zoteroUser)await syncZoteroLibrary({silent:true});
    const cutoff=cutoffFromPeriod(state.prefs.periodCount||30,state.prefs.periodUnit||'days');
    const sources=Array.isArray(state.prefs.sources)?state.prefs.sources:['openalex','pubmed'];
    const key=sessionStorage.getItem('swipaper-openalex')||'';
    const tasks=state.topics.flatMap(topic=>sources.map(source=>({topic,source})));
    if(!tasks.length)throw new Error('Sélectionnez une source bibliographique.');
    const results=await Promise.allSettled(tasks.map(x=>fetchSource(x.topic,x.source,cutoff,1,key,state.prefs.types||['article','review','preprint'])));
    const valid=results.filter(r=>r.status==='fulfilled');
    if(!valid.length)throw new Error('Sources indisponibles ou accès bloqué.');
    const fromLibrary=localFingerprints();
    const zotero=[...(state.prefs.zoteroUser?state.zoteroIndex.keys:[]),...(state.externalIndex?.keys||[])];
    const found=deduplicate(valid.flatMap(r=>r.value.articles).sort((a,b)=>b.date.localeCompare(a.date)||b.relevanceScore-a.relevanceScore))
      .filter(a=>isFresh(a,{cutoff,seen:fromLibrary,zotero}));
    const known=new Set(state.alerts.known||[]);
    const first=!state.alerts.lastCheck;
    const fresh=first?[]:found.filter(a=>!fingerprints(a).some(fp=>known.has(fp)));
    for(const a of found)for(const fp of fingerprints(a))known.add(fp);
    state.alerts.known=[...known].slice(-6000);
    state.alerts.unseen=deduplicate([...(state.alerts.unseen||[]),...fresh])
      .filter(a=>isFresh(a,{cutoff,seen:fromLibrary,zotero})).slice(0,100);
    // Une source en échec ne doit pas devenir un point de référence déclaré comme entièrement vérifié.
    if(valid.length===results.length)state.alerts.lastCheck=new Date().toISOString();
    persist();
    if(manual)showToast(first?'Veille initialisée sur les sources disponibles.':fresh.length+' nouvelle(s) publication(s) repérée(s).');
    if(valid.length<results.length)showToast('Veille partielle : certaines sources sont indisponibles et seront réessayées.');
  }catch(error){if(manual)showToast('Veille indisponible : '+error.message);}
  finally{alertLoading=false;refreshAfterBackgroundUpdate();}
}
function renderTopics(){
  const editing=topicById(topicEditorId)||{id:'',name:'',query:'',scope:'title_abstract'};
  const scope=themeScope(editing);
  const cards=state.topics.map(t=>{
    const parsedScope=themeScope(t);
    return '<article class="topic-card"><div class="icon-tile">⌕</div><div class="topic-scope">'+(parsedScope==='title'?'TITRE UNIQUEMENT':'TITRE + ABSTRACT')+'</div><h3>'+esc(t.name)+'</h3><p class="topic-query-text">'+esc(t.query)+'</p>'+
      '<div class="bottom"><span class="tag alt">Recherche stricte</span><div class="button-row"><button type="button" class="text-btn" data-act="edit-topic" data-id="'+esc(t.id)+'">Modifier</button><button type="button" class="text-btn danger" data-act="delete-topic" data-id="'+esc(t.id)+'">Supprimer</button></div></div></article>';
  }).join('');
  const searchScholar=t=>'https://scholar.google.com/scholar?q='+encodeURIComponent(t.query);
  root.innerHTML=pageIntro('THÉMATIQUES','Mes thématiques','Définissez des recherches réutilisables avec des mots-clés précis.')+
    '<div class="advanced-search-layout"><div class="panel query-panel"><div class="query-header"><span class="eyebrow">'+(editing.id?'MODIFIER LA RECHERCHE':'NOUVELLE THÉMATIQUE')+'</span><span class="query-badge">MOTEUR BOOLÉEN</span></div>'+
    '<form id="topic-form" class="form-stack"><input type="hidden" name="topicId" value="'+esc(editing.id)+'">'+
    '<div class="field"><label for="topic-name">NOM DE VOTRE THÉMATIQUE</label><input id="topic-name" name="topicName" required maxlength="70" placeholder="Ex. Intégration olfactive" value="'+esc(editing.name)+'"></div>'+
    '<div class="field"><label for="topic-query">EXPRESSION DE RECHERCHE</label>'+
    '<div class="query-builder"><div class="query-tools">'+['AND','OR','NOT','(',')','"phrase"'].map(t=>'<button type="button" class="query-token" data-act="insert-token" data-token="'+esc(t)+'">'+esc(t)+'</button>').join('')+'</div>'+
    '<textarea id="topic-query" name="topicQuery" required maxlength="400" rows="5" spellcheck="false" placeholder="(olfaction OR odor) AND (attention OR perception) NOT review">'+esc(editing.query)+'</textarea></div>'+
    '<small>AND = tous les critères · OR = alternatives · NOT = exclusion · "..." = expression exacte. Sans opérateur, AND est utilisé.</small></div>'+
    '<div class="field"><label for="topic-scope">RECHERCHER DANS</label><select name="topicScope" id="topic-scope"><option value="title_abstract" '+(scope==='title_abstract'?'selected':'')+'>Titres ET résumés (champ combiné)</option><option value="title" '+(scope==='title'?'selected':'')+'>Titres uniquement (plus strict)</option></select></div>'+
    '<div id="query-feedback" class="query-feedback" role="status" aria-live="polite"></div>'+
    '<div class="button-row"><button class="btn" type="submit">'+(editing.id?'Enregistrer les modifications':'Créer ma recherche')+' <span aria-hidden="true">→</span></button>'+(editing.id?btn('Annuler','cancel-topic-edit','secondary'):'')+'</div></form></div>'+
    '<aside class="search-guide"><p class="eyebrow">EXEMPLE DE STRATÉGIE</p><div class="guide-paper"><span class="tag">LOGIQUE STRICTE</span><h3>La bonne publication. Pas simplement un mot isolé.</h3><code>("olfactory perception" OR olfaction) AND ("temporal integration" OR timing) NOT review</code><p>Chaque résultat doit satisfaire toute l’expression, pas seulement les mots qui ressemblent au thème.</p>'+
    '<button type="button" data-act="example-query" class="btn secondary">Utiliser cet exemple</button></div><div class="guide-tip"><strong>Recherche dans le titre</strong><p>Choisissez « Titres uniquement » pour imposer la présence de vos critères dans le titre. Pour une recherche plus large, utilisez le titre et le résumé.</p></div></aside></div>'+
    '<div class="spacer"></div><div class="section-between"><h2 class="section-title">Vos thématiques · '+state.topics.length+'</h2>'+btn('Découvrir des articles','go-discover','secondary small')+'</div>'+
    (state.topics.length?'<div class="cards-grid">'+cards+'</div>':empty('Commencez avec votre première recherche','Aucune thématique prédéfinie. Créez une stratégie pour découvrir des publications ciblées.'))+
    '<div class="spacer"></div><div class="pill-note">Google Scholar n’est pas utilisé comme source automatique. '+(state.topics.length?'Rechercher manuellement : '+state.topics.map(t=>'<a href="'+esc(searchScholar(t))+'" rel="noopener noreferrer" target="_blank">'+esc(t.name)+' ↗</a>').join(' · '):'Vos recherches pourront être ouvertes manuellement dans Google Scholar.')+'</div>';
  updateQueryFeedback();
}
function updateQueryFeedback(){
  const input=el('topic-query'),area=el('query-feedback');
  if(!input||!area)return;
  if(!input.value.trim()){area.className='query-feedback';area.textContent='Saisissez vos mots-clés pour vérifier la logique de recherche avant d’enregistrer.';return;}
  try {
    const parsed=parseScientificQuery(input.value);
    area.className='query-feedback valid';
    area.textContent='✓ Expression valide · '+parsed.positives.length+' critère(s) positif(s)'+(parsed.excluded.length?' · '+parsed.excluded.length+' exclusion(s)':'')+' · Les résultats seront revérifiés après leur récupération.';
  }catch(error){area.className='query-feedback invalid';area.textContent='✕ '+error.message;}
}
function openLibraryReset(){
  if(el('modal-layer'))el('modal-layer').remove();
  const total=Object.keys(state.library||{}).length;
  const dialog=document.createElement('div');
  dialog.className='modal-layer';
  dialog.id='modal-layer';
  dialog.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-library-title">'+
    '<p class="eyebrow">GESTION DE LA BIBLIOTHÈQUE</p><h2 id="reset-library-title">Réinitialiser la bibliothèque ?</h2>'+
    '<p>Vous allez supprimer <strong>'+total+' article(s) sauvegardé(s) sur cet appareil</strong>. Les thématiques, vos réglages, l’index Zotero et les références RIS resteront inchangés.</p>'+
    '<div class="pill-note">Par défaut, les articles déjà examinés ne réapparaîtront pas dans les prochains scans.</div>'+
    '<label class="reset-option" for="reset-all-decisions"><input id="reset-all-decisions" type="checkbox"><span><strong>Oublier aussi tous les articles déjà traités</strong><small>Efface les décisions, l’historique des sessions, les alertes locales et la session en cours. Ces articles pourront réapparaître s’ils ne sont pas déjà dans Zotero ou un import RIS.</small></span></label>'+
    '<div class="actions" style="flex-wrap:wrap"><button class="btn secondary" type="button" data-act="backup">Sauvegarder avant</button>'+
    '<button class="btn secondary" type="button" data-act="close-modal">Annuler</button>'+
    '<button class="btn danger" type="button" data-act="confirm-library-reset">Réinitialiser</button></div></div>';
  document.body.appendChild(dialog);
  dialog.querySelector('[data-act="close-modal"]')?.focus();
}
function resetLocalLibrary(){
  const forget=document.querySelector('#reset-all-decisions')?.checked===true;
  const message=forget?
    'Supprimer les articles enregistrés, toutes les décisions passées et l’historique local ?':
    'Effacer uniquement les articles enregistrés dans la bibliothèque locale ?';
  if(!confirm(message))return;
  state=resetLocalLibraryState(state,forget);
  libraryFilter='liked';
  el('modal-layer')?.remove();
  saveAndRender();
  showToast(forget?'Bibliothèque et historique des décisions réinitialisés.':'Bibliothèque vidée. Les articles déjà traités restent exclus.');
}

function renderLibrary(){
  const all=Object.values(state.library);
  const chosen=all.filter(x=>x.status===libraryFilter).sort((a,b)=>b.updated.localeCompare(a.updated));
  const tabs=[['liked','Intéressants'],['later','À lire plus tard']];
  const header=pageIntro('VOTRE BIBLIOTHÈQUE','Des articles qui comptent.','Retrouvez les publications sauvegardées au cours de vos sessions.',
    '<div class="button-row">'+btn('↓ Exporter RIS','export-library-ris','secondary small')+btn('↓ Exporter CSV','export-library-csv','secondary small')+btn('↗ Zotero','zotero-library','primary small')+btn('Réinitialiser','reset-library','danger small')+'</div>');
  root.innerHTML=header+'<div class="filters">'+tabs.map(([key,label])=>'<button class="chip '+(key===libraryFilter?'active':'')+'" data-act="library-filter" data-filter="'+key+'">'+label+' · '+all.filter(x=>x.status===key).length+'</button>').join('')+'</div>'+
    (chosen.length?'<div class="library-illustration"><img class="giraffe-variant library-giraffe" src="./assets/giraffe-library.svg" alt=""><span>'+chosen.length+' référence(s)</span></div><div class="list-stack">'+chosen.map(({article:a,status})=>'<article class="list-card"><div><h3>'+esc(a.title)+'</h3><p>'+esc(a.authors.slice(0,3).join(', '))+' · '+esc(a.journal)+' · '+esc(a.year||'')+'</p><div class="meta"><span>'+esc(a.topic)+'</span>'+(a.doi?'<a target="_blank" rel="noopener noreferrer" href="'+esc(a.url)+'">↗ DOI : '+esc(a.doi)+'</a>':'')+(a.pdf?'<a target="_blank" rel="noopener noreferrer" href="'+esc(a.pdf)+'">↗ PDF</a>':'')+'</div></div><div class="button-row">'+(status==='later'?btn('Conserver','promote','secondary small','data-id="'+esc(a.id)+'"'):'')+btn('◎ Citations','graph-library','secondary small','data-id="'+esc(a.id)+'"')+btn('Retirer','remove-library','ghost small','data-id="'+esc(a.id)+'"')+'</div></article>').join('')+'</div>':empty('Aucun article dans cette catégorie','Commencez une session et glissez les articles qui vous intéressent vers la droite.','go-discover','Découvrir'));
}
function renderHistory(){
  const sessions=state.history;
  root.innerHTML=pageIntro('HISTORIQUE','Sessions précédentes','Consultez et exportez les références des sessions terminées.')+
    (sessions.length?'<div class="list-stack">'+sessions.map(s=>{
      const c=counts(s.actions);
      return '<article class="list-card"><div><h3>Session du '+esc(new Date(s.started).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}))+'</h3><p>'+s.actions.length+' articles examinés · '+c.liked+' conservés · '+c.later+' à revoir · '+c.rejected+' écartés</p><span class="tag alt">'+esc(new Date(s.started).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))+'</span></div><div class="button-row">'+btn('RIS','history-ris','secondary small','data-id="'+esc(s.id)+'"')+btn('E-mail','history-email','secondary small','data-id="'+esc(s.id)+'"')+'</div></article>';
    }).join('')+'</div>':empty('Votre historique est vide','Les sessions terminées apparaîtront ici.','go-discover','Démarrer une session'));
}
function openScholarSearch(){
  const query=el('quick-query')?.value.trim()||state.prefs.quickQuery||'';
  if(!query){showToast('Saisissez des mots-clés avant d’ouvrir Google Scholar.');return;}
  window.open(scholarSearchUrl(query),'_blank','noopener,noreferrer');
}
function importScholarReferences(){
  const input=document.createElement('input');input.type='file';input.accept='.bib,.bibtex,.ris,.enw,text/plain';
  input.addEventListener('change',async()=>{
    try {
      const f=input.files?.[0];if(!f)return;
      if(f.size>12*1024*1024)throw Error('Fichier supérieur à 12 Mo.');
      const data=await f.text();
      const result=/\.(bib|bibtex)$/i.test(f.name)?bibtexFingerprints(data):risFingerprints(data);
      if(!result.count)throw Error('Aucune référence reconnue. Exportez en BibTeX ou EndNote.');
      state.externalIndex={importedAt:new Date().toISOString(),count:(state.externalIndex?.count||0)+result.count,
        keys:[...new Set([...(state.externalIndex?.keys||[]),...result.keys])]};
      saveAndRender();showToast(result.count+' référence(s) Scholar importée(s) pour le dédoublonnage.');
    }catch(e){showToast('Import Google Scholar : '+e.message);}
  });input.click();
}
async function openCitationGraph(article){
  if(!article){showToast('Sélectionnez un article.');return;}
  graphState={loading:true,data:null,error:'',selected:null,article,filters:{references:true,citing:true,related:true}};
  navigate('graph');
  const key=sessionStorage.getItem('swipaper-openalex')||'';
  async function json(url){
    if(!url)throw Error('DOI ou identifiant OpenAlex absent.');
    const r=await fetch(url,{headers:{Accept:'application/json'}});
    if(!r.ok)throw Error('OpenAlex HTTP '+r.status);
    return r.json();
  }
  try{
    const raw=await json(citationLookupUrl(article,key));
    const seed=Array.isArray(raw.results)?raw.results[0]:raw;
    if(!seed?.id)throw Error('Article introuvable sur OpenAlex.');
    const urls=[batchWorksUrl((seed.referenced_works||[]).slice(0,12),key),
      citationNeighborsUrl(openAlexWorkId(seed.id),'citing',key,12),
      batchWorksUrl((seed.related_works||[]).slice(0,7),key)];
    const results=await Promise.allSettled(urls.map(url=>url?json(url):Promise.resolve({results:[]})));
    if(results.every(x=>x.status==='rejected'))throw Error('Impossible de récupérer les relations.');
    const [references,citing,related]=results.map(x=>x.status==='fulfilled'?x.value.results||[]:[]);
    graphState.data=buildCitationGraph(seed,{references,citing,related});
    graphState.selected=graphState.data.nodes[0];
    if(results.some(x=>x.status==='rejected'))showToast('Réseau partiel : certaines relations sont indisponibles.');
  }catch(e){graphState.error=e.message;}
  finally{graphState.loading=false;if(view==='graph')renderGraph();}
}
function selectGraphNode(id){
  const node=graphState.data?.nodes.find(n=>n.id===id);
  if(node){graphState.selected=node;renderGraph();}
}
function renderGraph(){
  const g=graphState.data;
  const intro=pageIntro('CITATIONS','Explorer les liens entre articles','Références, articles citants et travaux apparentés issus d’OpenAlex.',
    btn('Retour à la recherche','go-discover','secondary small'));
  if(graphState.loading){root.innerHTML=intro+'<div class="network-loading"><img src="./assets/giraffe-citations.svg" alt="" width="125"><p>Chargement des relations…</p></div>';return;}
  if(graphState.error||!g){root.innerHTML=intro+empty('Réseau indisponible',graphState.error||'Choisissez un article.',graphState.article?'graph-retry':'go-discover',graphState.article?'Réessayer':'Rechercher');return;}
  const filters=graphState.filters||{references:true,citing:true,related:true};
  const visible=filterCitationGraph(g,filters);
  if(!visible.nodes.some(n=>n.id===graphState.selected?.id))graphState.selected=g.nodes[0];
  const pos=citationLayout(visible),color={seed:'#276448',references:'#67a884',citing:'#d69d60',related:'#849bb8',citation:'#356d54'};
  const lines=visible.edges.map(e=>{
    const a=pos[e.source],b=pos[e.target];
    return a&&b?'<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" stroke="'+color[e.type]+'" stroke-width="3" opacity=".5"/>':'';
  }).join('');
  const nodes=visible.nodes.map(n=>{
    const p=pos[n.id];if(!p)return '';
    const radius=n.id===g.seed?34:20;
    const title=n.title.length>30?n.title.slice(0,28)+'…':n.title;
    return '<g role="button" tabindex="0" class="citation-node" data-act="graph-node" data-id="'+esc(n.id)+'" aria-label="'+esc(n.title)+'">'+
      '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+radius+'" fill="'+color[n.category]+'" stroke="'+(graphState.selected?.id===n.id?'#1d4a35':'white')+'" stroke-width="5"/>'+
      '<text x="'+p.x+'" y="'+(p.y+4)+'" text-anchor="middle" fill="white" font-size="11">'+(n.id===g.seed?'ÉTUDE':'●')+'</text>'+
      '<text x="'+p.x+'" y="'+(p.y+radius+17)+'" text-anchor="middle" fill="#274b35" font-size="10">'+esc(title)+'</text></g>';
  }).join('');
  const n=graphState.selected||g.nodes[0],groups=[['references','Cités'],['citing','Citants'],['related','Apparentés']];
  root.innerHTML=intro+'<div class="citation-layout"><section class="citation-canvas"><div class="network-legend">'+
    groups.map(([k,label])=>'<span><i style="background:'+color[k]+'"></i>'+label+'</span>').join('')+'</div>'+
    '<div class="citation-filters" role="group" aria-label="Afficher les relations bibliographiques">'+
    groups.map(([k,label])=>'<button type="button" data-act="graph-filter" data-kind="'+k+'" aria-pressed="'+(filters[k]!==false)+'" class="citation-filter '+(filters[k]!==false?'active':'')+'">'+label+' · '+g.totals[k]+'</button>').join('')+'</div>'+
    '<div class="citation-visible-count" role="status">'+visible.nodes.length+' publication(s) affichée(s) sur '+g.nodes.length+'</div>'+
    '<svg class="citation-svg" viewBox="0 0 1020 620" role="group" aria-label="Carte des relations bibliographiques">'+lines+nodes+'</svg>'+
    '<p class="tiny muted">Sélectionnez un nœud. Le graphe présente un échantillon des relations connues.</p></section>'+
    '<aside class="citation-details"><img class="giraffe-variant citation-giraffe" src="./assets/giraffe-citations.svg" alt="">'+
    '<p class="eyebrow">PUBLICATION</p><h2>'+esc(n.title)+'</h2><p class="tiny muted">'+esc(n.authors.join(', ')||'Auteur non renseigné')+' · '+esc(n.year||'Date inconnue')+'</p>'+
    '<div class="citation-counters">'+groups.map(([k,label])=>'<div><strong>'+g.totals[k]+'</strong><small>'+label+'</small></div>').join('')+'</div>'+
    '<div class="button-row"><a class="btn secondary small" href="'+esc(n.url)+'" target="_blank" rel="noopener noreferrer">Consulter ↗</a>'+
    btn('Explorer cet article','graph-related','secondary small')+'</div></aside></div>';
}

function renderSettings(){
  const zi=state.zoteroIndex||{user:'',syncedAt:null,count:0,keys:[]};
  const ei=state.externalIndex||{importedAt:null,keys:[],count:0};
  const zoteroStatus=state.prefs.zoteroUser&&zi.user===state.prefs.zoteroUser&&zi.syncedAt
    ?zi.count+' références indexées · actualisées le '+new Date(zi.syncedAt).toLocaleString('fr-FR')
    :'Aucune synchronisation Zotero confirmée.';
  root.innerHTML=pageIntro('PARAMÈTRES','Bibliothèques associées','Connectez Zotero et gérez les références exclues de vos recherches.')+
    '<div class="session-setup"><div class="panel"><h2 class="section-title">Bibliothèque Zotero</h2>'+
    '<p class="muted tiny" style="line-height:1.8">Swipaper vérifie toutes les références bibliographiques de votre bibliothèque personnelle Zotero avant chaque session. Vous devez fournir un identifiant numérique et une clé API avec permission de lecture ; l’écriture n’est utile que pour exporter vers Zotero.</p>'+
    '<div class="pill-note">'+esc(zoteroStatus)+'</div><div class="spacer"></div>'+
    '<form id="settings-form" class="form-stack"><div class="field"><label for="zotero-user">Identifiant numérique Zotero</label><input id="zotero-user" name="zoteroUser" inputmode="numeric" pattern="[0-9]*" placeholder="Ex. 1234567" value="'+esc(state.prefs.zoteroUser)+'"></div>'+
    '<div class="field"><label for="zotero-key">Clé API Zotero</label><input id="zotero-key" name="zoteroKey" type="password" autocomplete="off" placeholder="Clé API temporaire"><small>Clé conservée uniquement dans le stockage de session du navigateur, jamais dans le dépôt ni dans les sauvegardes.</small></div>'+
    '<div class="field"><label for="zotero-collection">Collection Zotero de destination (facultative)</label><input id="zotero-collection" name="zoteroCollection" maxlength="8" placeholder="Ex. ABCD1234" value="'+esc(state.prefs.zoteroCollection)+'"><small>Ce choix concerne l’export uniquement : l’exclusion des doublons examine toute la bibliothèque.</small></div>'+
    '<details class="advanced-filters"><summary>Google Scholar (connexion serveur facultative)</summary><div class="advanced-filters-inner">'+
    '<p class="tiny muted">Pour interroger Google Scholar automatiquement, un serveur privé et un fournisseur tiers sont nécessaires. Sinon, utilisez l’import BibTeX/EndNote.</p>'+
    '<div class="field"><label for="scholar-proxy">URL du serveur Scholar</label><input id="scholar-proxy" name="scholarProxy" type="url" placeholder="https://example.workers.dev" value="'+esc(state.prefs.scholarProxy||'')+'"></div>'+
    '<div class="field"><label for="scholar-token">Jeton d’accès au serveur</label><input id="scholar-token" name="scholarToken" type="password" autocomplete="off" placeholder="Jeton temporaire"><small>Il reste uniquement dans le navigateur pendant la session.</small></div></div></details>'+
    '<div class="field"><label for="openalex-key">Clé API OpenAlex (facultative)</label><input id="openalex-key" name="openalexKey" type="password" autocomplete="off" placeholder="Clé gratuite personnelle"><small>Augmente les quotas de recherche sur OpenAlex. Sans clé, un usage occasionnel demeure possible.</small></div>'+
    '<div class="button-row"><button class="btn" type="submit">Enregistrer</button>'+btn(syncingZotero?'Synchronisation…':'↻ Vérifier ma bibliothèque Zotero','sync-zotero','secondary',syncingZotero?'disabled':'')+btn('Dissocier Zotero','unlink-zotero','ghost')+'</div></form></div>'+
    '<div class="soft-panel"><p class="eyebrow">AUTRES BIBLIOTHÈQUES</p><h2 class="section-title">Importer des références RIS</h2>'+
    '<p class="tiny muted" style="line-height:1.9">Vous pouvez également importer un fichier RIS exporté depuis Zotero, Mendeley, EndNote ou un autre logiciel bibliographique. '+(ei.importedAt?'Dernier import : '+esc(new Date(ei.importedAt).toLocaleString('fr-FR'))+' · '+ei.count+' références.':'Aucune bibliothèque externe importée.')+'</p>'+
    '<div class="button-row">'+btn('↑ Importer un fichier RIS','import-ris','secondary small')+btn('Effacer cet import','clear-ris','ghost small')+'</div>'+
    '<div class="divider"></div><p class="eyebrow">VOS DONNÉES</p><p class="tiny muted" style="line-height:1.9">Vos thèmes, sessions et index bibliographiques restent sur cet appareil. Les clés d’accès ne sont pas incluses dans la sauvegarde. La synchronisation entre différents appareils n’est pas encore disponible.</p>'+
    '<div class="button-row">'+btn('Sauvegarder','backup','secondary small')+btn('Restaurer','restore','secondary small')+btn('Réinitialiser la bibliothèque','reset-library','danger small')+'</div></div></div>';
}
function importRIS(){
  const input=document.createElement('input');
  input.type='file';input.accept='.ris,application/x-research-info-systems,text/plain';
  input.addEventListener('change',async()=>{
    try{
      if(!input.files?.[0])return;
      if(input.files[0].size>12*1024*1024)throw new Error('Fichier RIS trop volumineux (maximum 12 Mo).');
      const data=risFingerprints(await input.files[0].text());
      if(!data.count)throw new Error('Aucune référence bibliographique valide dans ce fichier RIS.');
      state.externalIndex={importedAt:new Date().toISOString(),count:data.count,keys:data.keys};
      persist();render();showToast(data.count+' références importées : elles seront exclues des prochains scans.');
    }catch(error){showToast('Import RIS impossible : '+error.message);}
  });
  input.click();
}
function selectedFromSession(s){return s.actions.filter(a=>a.decision==='liked').map(a=>a.article);}
function selectedLibrary(){return Object.values(state.library).filter(x=>x.status==='liked').map(x=>x.article);}
function download(name,content,type){
  if(!content){showToast('Aucune référence à exporter.');return;}
  const blob=new Blob([content],{type:type+';charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportItems(items,format='ris'){
  if(format==='ris')download('swipaper-references.ris',asRIS(items),'application/x-research-info-systems');
  if(format==='csv')download('swipaper-references.csv','\uFEFF'+asCSV(items),'text/csv');
}
function emailItems(items){
  if(!items.length){showToast('Aucune référence sélectionnée.');return;}
  const brief=items.slice(0,15);
  const body='Sélection Swipaper — '+new Date().toLocaleDateString('fr-FR')+'\n\n'+brief.map((a,i)=>(i+1)+'. '+a.title+'\n'+a.authors.join(', ')+'\n'+(a.doi?'DOI : '+a.doi+'\n':'')+(a.url||'')).join('\n\n')+(items.length>15?'\n\n'+(items.length-15)+' autres références : exporter le fichier RIS pour les joindre.':'');
  const target='mailto:?subject='+encodeURIComponent('Ma sélection scientifique Swipaper')+'&body='+encodeURIComponent(body);
  if(target.length>8000){showToast('Sélection volumineuse : préférez le fichier RIS.');return;}
  location.href=target;
}
async function sendToZotero(items){
  if(!items.length){showToast('Aucune référence sélectionnée.');return;}
  const user=state.prefs.zoteroUser.trim();
  let key=sessionStorage.getItem('swipaper-zotero')||'';
  if(!user||!key){navigate('settings');showToast('Renseignez l’identifiant et la clé API Zotero dans les paramètres.');return;}
  if(!/^\d+$/.test(user)){showToast('Identifiant Zotero invalide.');return;}
  if(!confirm('Importer '+items.length+' référence(s) vers Zotero ? Vérifiez les doublons éventuels dans votre bibliothèque.'))return;
  let count=0;
  try{
    for(let i=0;i<items.length;i+=50){
      const chunk=items.slice(i,i+50).map(a=>zoteroItem(a,state.prefs.zoteroCollection.trim()));
      const response=await fetch('https://api.zotero.org/users/'+encodeURIComponent(user)+'/items',{
        method:'POST',
        headers:{'Content-Type':'application/json','Zotero-API-Version':'3','Zotero-API-Key':key,'Zotero-Write-Token':uid()},
        body:JSON.stringify(chunk)
      });
      if(!response.ok)throw new Error('HTTP '+response.status+' : '+(await response.text()).slice(0,180));
      const result=await response.json();
      const success=Object.keys(result.success||{}).length;
      const failed=Object.keys(result.failed||{}).length;
      count+=success;
      if(failed)throw new Error(failed+' référence(s) refusée(s) par Zotero.');
    }
    showToast(count+' référence(s) ajoutée(s) à Zotero. Les PDF restent accessibles via leurs liens.');
  }catch(error){showToast('Zotero : '+error.message+'. '+count+' référence(s) précédemment ajoutée(s).');}
}
function backup(){download('swipaper-sauvegarde.json',JSON.stringify({version:1,data:state},null,2),'application/json');}
function restore(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.addEventListener('change',async()=>{
    try{
      const parsed=JSON.parse(await input.files[0].text());
      if(parsed.version!==1||!Array.isArray(parsed.data?.topics)||!parsed.data?.library||!Array.isArray(parsed.data?.history))throw new Error('Format de sauvegarde invalide.');
      if(confirm('Remplacer les thématiques, décisions et sessions locales par cette sauvegarde ?')){
        state={...structuredClone(DEFAULT),...parsed.data,prefs:{...DEFAULT.prefs,...parsed.data.prefs}};
        saveAndRender();showToast('Sauvegarde restaurée.');
      }
    }catch(err){showToast('Import impossible : '+err.message);}
  });input.click();
}
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-view],[data-act]');
  if(!button)return;
  if(button.dataset.view){navigate(button.dataset.view);return;}
  const act=button.dataset.act,id=button.dataset.id;
  if(act==='like')animatedDecision('liked');
  if(act==='reject')animatedDecision('rejected');
  if(act==='later')animatedDecision('later');
  if(act==='undo')undo();
  if(act==='finish'&&!swipeAnimationLocked){if(confirm('Terminer cette session maintenant ? Les articles non examinés ne seront pas comptabilisés.'))finishSession();}
  if(act==='reset-summary'){showCompletion=false;state.lastSummary=null;saveAndRender();}
  if(act==='go-discover')navigate('discover');
  if(act==='go-topics')navigate('topics');
  if(act==='go-settings')navigate('settings');
  if(act==='try-example'){const input=el('quick-query');if(input){input.value=button.dataset.query||'';input.focus();updateQuickQueryFeedback();}}
  if(act==='toggle-search-pane'){
    mobileFiltersOpen=!mobileFiltersOpen;
    const shell=document.querySelector('.discover-workspace');
    shell?.classList.toggle('filters-open',mobileFiltersOpen);
  }
  if(act==='scholar-search')openScholarSearch();
  if(act==='graph-current'&&state.active)openCitationGraph(state.active.articles[state.active.index]);
  if(act==='graph-library'&&state.library[id])openCitationGraph(state.library[id].article);
  if(act==='graph-retry'&&graphState.article)openCitationGraph(graphState.article);
  if(act==='graph-node')selectGraphNode(id);
  if(act==='graph-filter'&&['references','citing','related'].includes(button.dataset.kind)){
    const kind=button.dataset.kind;
    graphState.filters[kind]=graphState.filters[kind]===false;
    renderGraph();
  }
  if(act==='graph-related'&&graphState.selected)openCitationGraph({openAlexId:'https://openalex.org/'+graphState.selected.id,title:graphState.selected.title,doi:graphState.selected.doi});
  if(act==='scholar-import')importScholarReferences();
  if(act==='clear-quick-search'){
    state.prefs.quickQuery='';state.prefs.periodCount=3;state.prefs.periodUnit='months';state.prefs.selectedTopicIds=[];
    state.prefs.searchScope='title_abstract';state.prefs.sources=['openalex','pubmed'];
    state.prefs.types=['article','review','preprint'];persist();render();
  }
  if(act==='example-query'){
    const q=el('topic-query');if(q){q.value='("olfactory perception" OR olfaction) AND ("temporal integration" OR timing) NOT review';updateQueryFeedback();q.focus();}
  }
  if(act==='insert-token'){
    const q=el('topic-query')||el('quick-query');if(q){const val=button.dataset.token==='"phrase"'?'""':button.dataset.token;const left=q.value.slice(0,q.selectionStart),right=q.value.slice(q.selectionEnd);q.value=left+(left&&!/\s$/.test(left)?' ':'')+val+' '+right;q.focus();const at=q.value.indexOf(val,left.length)+(val==='""'?1:val.length);q.setSelectionRange(at,at);updateQueryFeedback();updateQuickQueryFeedback();}
  }
  if(act==='reset-library')openLibraryReset();
  if(act==='confirm-library-reset')resetLocalLibrary();
  if(act==='library-filter'){libraryFilter=button.dataset.filter;render();}
  if(act==='new-topic'){topicEditorId='';render();el('topic-name')?.focus();}
  if(act==='edit-topic'){topicEditorId=id;render();el('topic-name')?.focus();}
  if(act==='cancel-topic-edit'){topicEditorId='';render();}
  if(act==='sync-zotero')syncZoteroLibrary().catch(error=>showToast(error.message));
  if(act==='import-ris')importRIS();
  if(act==='clear-ris'&&confirm('Effacer l’index des références importées par RIS ?')){state.externalIndex={importedAt:null,keys:[],count:0};saveAndRender();}
  if(act==='unlink-zotero'&&confirm('Dissocier Zotero et supprimer son index local ?')){
    state.prefs.zoteroUser='';state.prefs.zoteroCollection='';
    state.zoteroIndex={user:'',syncedAt:null,keys:[],count:0};
    sessionStorage.removeItem('swipaper-zotero');saveAndRender();
  }
  if(act==='delete-topic'){
    const t=topicById(id);
    if(t&&confirm('Supprimer la thématique « '+t.name+' » ?')){
      state.topics=state.topics.filter(x=>x.id!==id);
      if(topicEditorId===id)topicEditorId='';
      state.alerts={lastCheck:null,known:[],unseen:[]};
      saveAndRender();
    }
  }
  if(act==='close-modal')el('modal-layer')?.remove();
  if(act==='remove-library'){delete state.library[id];saveAndRender();}
  if(act==='promote'){if(state.library[id])state.library[id].status='liked';saveAndRender();}
  if(act==='export-library-ris')exportItems(selectedLibrary(),'ris');
  if(act==='export-library-csv')exportItems(selectedLibrary(),'csv');
  if(act==='export-last-ris'&&state.lastSummary)exportItems(selectedFromSession(state.lastSummary),'ris');
  if(act==='email-last'&&state.lastSummary)emailItems(selectedFromSession(state.lastSummary));
  if(act==='zotero-last'&&state.lastSummary)sendToZotero(selectedFromSession(state.lastSummary));
  if(act==='zotero-library')sendToZotero(selectedLibrary());
  if(act==='history-ris'){const s=state.history.find(x=>x.id===id);if(s)exportItems(selectedFromSession(s),'ris');}
  if(act==='history-email'){const s=state.history.find(x=>x.id===id);if(s)emailItems(selectedFromSession(s));}
  if(act==='backup')backup();
  if(act==='restore')restore();
  if(act==='check-alerts')checkNewPapers(true);
  if(act==='clear-alerts'){state.alerts.unseen=[];saveAndRender();}
});
document.addEventListener('input',event=>{if(event.target.id==='topic-query')updateQueryFeedback();if(event.target.id==='quick-query')updateQuickQueryFeedback();});
document.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target;
  if(form.id==='session-form')startSession(form);
  if(form.id==='topic-form'){
    const fd=new FormData(form);
    const name=String(fd.get('topicName')||'').trim();
    const query=String(fd.get('topicQuery')||'').trim();
    const scope=String(fd.get('topicScope')||'title_abstract');
    const id=String(fd.get('topicId')||'');
    if(!name||!query){showToast('Nom et mots-clés obligatoires.');return;}
    if(!['title','title_abstract'].includes(scope)){showToast('Champ de recherche non reconnu.');return;}
    try{parseScientificQuery(query);}catch(error){showToast('Requête invalide : '+error.message);return;}
    if(id){
      const topic=topicById(id);
      if(!topic){showToast('Thématique introuvable.');return;}
      topic.name=name;topic.query=query;topic.scope=scope;
    }else state.topics.push({id:uid(),name,query,scope});
    topicEditorId='';
    state.alerts={lastCheck:null,known:[],unseen:[]};
    saveAndRender();showToast('Thématique enregistrée : '+name);
  }
  if(form.id==='settings-form'){
    const nextUser=form.elements.zoteroUser.value.trim();
    if(nextUser!==state.prefs.zoteroUser){
      state.zoteroIndex={user:'',syncedAt:null,keys:[],count:0};
      sessionStorage.removeItem('swipaper-zotero');
    }
    state.prefs.zoteroUser=nextUser;
    state.prefs.zoteroCollection=form.elements.zoteroCollection.value.trim().toUpperCase();
    if(form.elements.zoteroKey.value.trim())sessionStorage.setItem('swipaper-zotero',form.elements.zoteroKey.value.trim());
    if(form.elements.openalexKey.value.trim())sessionStorage.setItem('swipaper-openalex',form.elements.openalexKey.value.trim());
    const nextProxy=String(form.elements.scholarProxy?.value||'').trim();
    if(nextProxy&&!/^https:\/\//i.test(nextProxy)){showToast('Le serveur Scholar doit être en HTTPS.');return;}
    if(nextProxy!==state.prefs.scholarProxy)sessionStorage.removeItem('swipaper-scholar-token');
    state.prefs.scholarProxy=nextProxy;
    if(form.elements.scholarToken?.value.trim())sessionStorage.setItem('swipaper-scholar-token',form.elements.scholarToken.value.trim());
    saveAndRender();showToast('Préférences enregistrées sur cet appareil.');
  }
});
document.addEventListener('keydown',event=>{
  if(view==='graph'&&(event.key==='Enter'||event.key===' ')&&event.target.closest?.('[data-act="graph-node"]')){
    event.preventDefault();selectGraphNode(event.target.closest('[data-act="graph-node"]').dataset.id);return;
  }
  if(event.key==='Escape')el('modal-layer')?.remove();
  if(view!=='discover'||!state.active||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target.matches('input,textarea,select,[contenteditable]')||event.target.closest('.modal-layer'))return;
  if(event.key==='ArrowLeft'){event.preventDefault();animatedDecision('rejected');}
  if(event.key==='ArrowRight'){event.preventDefault();animatedDecision('liked');}
  if(event.key==='ArrowDown'){event.preventDefault();animatedDecision('later');}
  if(event.key==='Backspace'){event.preventDefault();undo();}
});
window.addEventListener('hashchange',()=>{showCompletion=false;view=TITLES[location.hash.slice(1)]?location.hash.slice(1):'discover';render();});
function updateNetwork(){
  const online=navigator.onLine;
  el('online-label').textContent=online?'En ligne':'Hors ligne';
  el('online-dot').classList.toggle('offline',!online);
}
window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installing=event;el('install-button').hidden=false;});
el('install-button').addEventListener('click',async()=>{if(!installing)return;installing.prompt();await installing.userChoice;installing=null;el('install-button').hidden=true;});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
updateNetwork();render();
if(navigator.onLine)checkNewPapers(false);
