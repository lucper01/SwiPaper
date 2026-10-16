import { toArticle, toEuropePMCArticle, deduplicate, openAlexUrl, europePmcUrl, cutoffFromPeriod, fingerprints, zoteroFingerprints, isFresh, asRIS, asCSV, zoteroItem } from './core.mjs';

const STORAGE='swipaper-v1-state';
const TITLES={discover:'Découvrir',library:'Bibliothèque',topics:'Mes thématiques',history:'Historique',settings:'Paramètres'};
const DEFAULT={
  topics:[],
  library:{},seen:{},history:[],active:null,lastSummary:null,alerts:{lastCheck:null,known:[],unseen:[]},
  zoteroIndex:{user:'',syncedAt:null,keys:[],count:0},
  prefs:{periodCount:30,periodUnit:'days',sources:['openalex','pubmed'],batch:20,zoteroUser:'',zoteroCollection:''}
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
      return {...structuredClone(DEFAULT),...data,topics:migrated,prefs:{...DEFAULT.prefs,...data.prefs},zoteroIndex:data.zoteroIndex||structuredClone(DEFAULT.zoteroIndex)};
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
  return '<button class="btn '+cls+'" data-act="'+action+'" '+attrs+'>'+label+'</button>';
}
function empty(title,description,action='',label=''){
  return '<div class="empty"><div class="symbol">◈</div><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p>'+(action?btn(esc(label),action,'primary'):'')+'</div>';
}
function topicById(id){return state.topics.find(t=>t.id===id);}
function counts(actions=[]){
  return {liked:actions.filter(x=>x.decision==='liked').length,later:actions.filter(x=>x.decision==='later').length,rejected:actions.filter(x=>x.decision==='rejected').length};
}
function saveAndRender(){persist();render();}
function render(){
  el('breadcrumb').textContent=TITLES[view];
  document.querySelectorAll('[data-view]').forEach(node=>node.classList.toggle('active',node.dataset.view===view));
  el('saved-count').textContent=Object.values(state.library).filter(x=>x.status==='liked').length;
  if(view==='discover')renderDiscover();
  if(view==='library')renderLibrary();
  if(view==='topics')renderTopics();
  if(view==='history')renderHistory();
  if(view==='settings')renderSettings();
}
function navigate(next){
  if(!TITLES[next])return;
  view=next;location.hash=next;render();window.scrollTo({top:0,behavior:'instant'});
}
function setup(){
  const tags=state.topics.map(t=>'<label class="check-chip"><input type="checkbox" name="topic" value="'+esc(t.id)+'" checked><span>'+esc(t.name)+'</span></label>').join('');
  const unread=state.alerts.unseen||[];
  const notice=state.topics.length?'<div class="soft-panel" style="margin-bottom:24px"><div class="button-row" style="justify-content:space-between"><div><strong style="font-size:13px">◌ Alertes de veille · '+unread.length+' nouveauté(s)</strong><p class="tiny muted" style="margin:7px 0 0">'+(state.alerts.lastCheck?'Dernière vérification : '+esc(new Date(state.alerts.lastCheck).toLocaleString('fr-FR')):'Première vérification à effectuer')+'</p></div>'+btn(alertLoading?'Vérification…':'↻ Vérifier les nouveautés','check-alerts','secondary small',alertLoading?'disabled':'')+'</div>'+
    (unread.length?'<div class="divider"></div>'+unread.slice(0,5).map(a=>'<div class="line" style="display:flex;justify-content:space-between;gap:12px;padding:7px 0"><span style="font-size:12px">'+esc(a.title)+'</span>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer" class="text-btn" style="white-space:nowrap">Voir ↗</a>':'')+'</div>').join('')+'<button class="text-btn" data-act="clear-alerts">Marquer comme consultées</button>':'')+'</div>':'')+'</div>':'';
  const period=state.prefs;
  const src=Array.isArray(period.sources)?period.sources:['openalex','pubmed'];
  const sourceBox=[['openalex','OpenAlex — multidisciplinaire'],['pubmed','PubMed / Europe PMC — biomédical']].map(([key,label])=>
    '<label class="check-chip"><input type="checkbox" name="source" value="'+key+'" '+(src.includes(key)?'checked':'')+'><span>'+label+'</span></label>'
  ).join('');
  return pageIntro('VOTRE PROCHAINE DÉCOUVERTE','Les nouveaux papiers, sans les doublons.','Définissez vos thématiques, choisissez une période de publication et découvrez uniquement les articles qui restent à examiner.')+notice+
    '<div class="session-setup"><div class="panel setup-card"><p class="eyebrow">NOUVELLE SESSION</p><h2>Que souhaitez-vous explorer ?</h2><p>Swipaper privilégie les plus récentes publications, puis écarte celles déjà parcourues ou présentes dans votre Zotero synchronisé.</p><form id="session-form" class="form-stack">'+
    '<div class="field"><label>THÉMATIQUES</label><div class="check-list">'+tags+'</div>'+(!state.topics.length?'<div class="pill-note">Aucune thématique définie. <button class="text-btn" type="button" data-act="go-topics">Créer ma première thématique →</button></div>':'')+'</div>'+
    '<div class="field"><label>BASES DE PUBLICATIONS</label><div class="check-list">'+sourceBox+'</div><small>La couverture PubMed passe par Europe PMC. Google Scholar n’autorise pas de collecte automatisée officielle.</small></div>'+
    '<div class="form-row"><div class="field"><label for="batch-size">ARTICLES PAR SESSION</label><select id="batch-size" name="batch">'+[10,20,30,50].map(n=>'<option value="'+n+'" '+(period.batch===n?'selected':'')+'>'+n+' articles</option>').join('')+'</select></div><div class="field"><label for="period-count">PUBLIÉS DEPUIS MOINS DE</label><div class="form-row" style="gap:8px;grid-template-columns:1fr 1.5fr"><input name="periodCount" id="period-count" type="number" min="1" max="3650" step="1" required value="'+esc(period.periodCount||30)+'"><select name="periodUnit" id="period-unit">'+[['days','jours'],['months','mois'],['years','années']].map(([k,v])=>'<option value="'+k+'" '+(period.periodUnit===k?'selected':'')+'>'+v+'</option>').join('')+'</select></div></div></div>'+
    '<div class="pill-note">'+(period.zoteroUser?
       'Zotero lié · '+(state.zoteroIndex.user===period.zoteroUser&&state.zoteroIndex.syncedAt?state.zoteroIndex.count+' références vérifiées lors de la dernière synchronisation. Une nouvelle synchronisation sera effectuée avant le scan.':'Première synchronisation nécessaire avant le scan.')+
       ' <button class="text-btn" type="button" data-act="go-settings">Gérer Zotero →</button>':
       'Zotero non lié : les publications déjà examinées dans Swipaper seront exclues. <button class="text-btn" type="button" data-act="go-settings">Lier Zotero →</button>')+'</div>'+
    '<button class="btn" type="submit" '+(loading||!state.topics.length?'disabled':'')+'>'+(loading?'<span class="loading"></span> Recherche et dédoublonnage…':'Découvrir les publications les plus récentes →')+'</button>'+
    '</form></div><div class="soft-panel"><p class="eyebrow">LE PRINCIPE</p><div class="card-quote">New papers.<br>Fresh discoveries.</div><div class="divider"></div><p class="muted tiny" style="line-height:1.8">← Pas intéressant<br>→ À conserver<br>↓ À lire plus tard</p><div class="divider"></div><p class="tiny muted">Le filtrage utilise la date de publication, pas simplement la date d’indexation. Les articles déjà traités ne sont pas proposés à nouveau.</p></div></div>';
}
function paperCard(a){
  const authors=a.authors.slice(0,4).join(', ')+(a.authors.length>4?' et al.':'');
  return '<article class="paper-card" id="swipe-card" aria-label="Publication : '+esc(a.title)+'">'+
    '<div class="card-top"><span class="tag">'+esc(a.topic||'Publication')+'</span><span class="tag alt">'+esc(a.year||'Année inconnue')+'</span>'+(a.openAccess?'<span class="tag">◌ Accès ouvert</span>':'')+'</div>'+
    '<h2>'+esc(a.title)+'</h2><p class="authors">'+esc(authors||'Auteurs non renseignés')+'</p><p class="journal">'+esc(a.journal||'Source scientifique')+' '+(a.date?' · '+esc(a.date):'')+'</p><hr>'+
    '<p class="muted-label">ABSTRACT</p><p class="abstract">'+esc(a.abstract||'Résumé indisponible.')+'</p>'+
    '<div class="paper-links">'+(a.doi?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">↗ DOI</a>':'')+
    (a.url&&!a.doi?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">↗ Article</a>':'')+
    (a.pdf?'<a href="'+esc(a.pdf)+'" target="_blank" rel="noopener noreferrer">↗ PDF disponible</a>':'')+'</div></article>';
}
function renderDiscover(){
  if(!state.active){root.innerHTML=state.lastSummary?endScreen(state.lastSummary):setup();return;}
  const s=state.active;
  const a=s.articles[s.index];
  if(!a){finishSession();return;}
  const c=counts(s.actions);
  root.innerHTML=pageIntro('UNE SÉLECTION À LA FOIS','À vous de swiper.','Lisez le résumé, faites votre choix et avancez à votre rythme.',
    '<div class="button-row">'+btn('↶ Annuler','undo','secondary small',s.actions.length?'':'disabled')+btn('Terminer','finish','ghost small')+'</div>')+
    '<div class="discover-grid"><section class="session-column">'+
    '<div class="overview"><div class="stat"><span>ARTICLES GARDÉS</span><strong>'+c.liked+'</strong><span>Votre sélection</span></div><div class="stat"><span>À REVOIR</span><strong>'+c.later+'</strong><span>Pour plus tard</span></div><div class="stat"><span>EXAMINÉS</span><strong>'+s.index+'</strong><span>Dans cette session</span></div></div>'+
    '<div class="progress-wrap"><strong>Votre exploration</strong><span>'+Number(s.index+1)+' / '+s.articles.length+'</span></div><div class="progress"><div style="width:'+Math.round(s.index/s.articles.length*100)+'%"></div></div>'+
    '<div class="paper-stack">'+paperCard(a)+'</div>'+
    '<div class="swipe-actions"><button class="circle-btn reject" data-act="reject" aria-label="Pas intéressant" title="Pas intéressant (flèche gauche)">✕</button><button class="circle-btn hold" data-act="later" aria-label="À lire plus tard" title="À lire plus tard (flèche bas)">♧</button><button class="circle-btn like" data-act="like" aria-label="Intéressant" title="Intéressant (flèche droite)">♥</button></div>'+
    '<p class="swipe-help"><kbd>←</kbd> Passer &nbsp; <kbd>↓</kbd> Plus tard &nbsp; <kbd>→</kbd> Garder &nbsp; <kbd>Backspace</kbd> Annuler</p></section>'+
    '<aside class="side-panel"><div class="panel"><p class="eyebrow">SESSION EN COURS</p><h2 class="section-title">Votre progression</h2><div class="line"><span>Intéressants</span><strong>'+c.liked+'</strong></div><div class="line"><span>À examiner</span><strong>'+c.later+'</strong></div><div class="line"><span>Écartés</span><strong>'+c.rejected+'</strong></div><div class="line"><span>Restants</span><strong>'+(s.articles.length-s.index)+'</strong></div></div><div class="soft-panel" style="margin-top:16px"><p class="eyebrow">PETIT RAPPEL</p><div class="card-quote">Lisez moins.<br>Découvrez mieux.</div><p class="tiny muted" style="line-height:1.7">Une session interrompue peut être reprise plus tard sur cet appareil.</p></div></aside></div>';
  attachSwipe();
}
function decide(decision){
  const s=state.active;
  if(!s||s.index>=s.articles.length)return;
  const a=s.articles[s.index];
  const previous=state.library[a.id]||null;
  const priorSeen=state.seen[a.id]||null;
  s.actions.push({decision,article:a,previous,priorSeen});
  state.seen[a.id]=new Date().toISOString();
  if(decision==='liked'||decision==='later') state.library[a.id]={article:a,status:decision,updated:new Date().toISOString()};
  else delete state.library[a.id];
  s.index++;
  persist();
  if(s.index>=s.articles.length)finishSession();else render();
}
function undo(){
  const s=state.active;
  if(!s||!s.actions.length)return;
  const action=s.actions.pop();
  s.index=Math.max(0,s.index-1);
  if(action.previous)state.library[action.article.id]=action.previous;else delete state.library[action.article.id];
  if(action.priorSeen)state.seen[action.article.id]=action.priorSeen;else delete state.seen[action.article.id];
  saveAndRender();
}
function finishSession(){
  const s=state.active;if(!s)return;
  const summary={id:s.id,started:s.started,ended:new Date().toISOString(),actions:s.actions,planned:s.articles.length};
  state.history.unshift(summary);
  state.history=state.history.slice(0,60);
  state.active=null;
  state.lastSummary=summary;
  saveAndRender();
}
function endScreen(s){
  const c=counts(s.actions);
  return pageIntro('VOTRE SESSION EST TERMINÉE','Une belle récolte.','Voici le bilan de votre exploration scientifique.')+
    '<div class="end-card"><p class="eyebrow" style="color:#b5d5b8">RÉCAPITULATIF</p><h2 class="page-title">Session terminée.</h2><p class="page-subtitle">Vos décisions sont sauvegardées dans votre bibliothèque et votre historique.</p>'+
    '<div class="end-stats"><div><strong>'+s.actions.length+'</strong><small>Parcourus</small></div><div><strong>'+c.liked+'</strong><small>Intéressants</small></div><div><strong>'+c.later+'</strong><small>À revoir</small></div><div><strong>'+c.rejected+'</strong><small>Écartés</small></div></div>'+
    '<div class="end-actions">'+btn('Nouvelle session','reset-summary','primary')+btn('Exporter en RIS','export-last-ris','secondary')+btn('Récap par e-mail','email-last','secondary')+btn('Envoyer vers Zotero','zotero-last','secondary')+'</div></div>'+
    '<div class="spacer"></div><div class="pill-note">L’e-mail s’ouvre dans votre application de messagerie pour validation. L’envoi automatique sera disponible dans une future version.</div>';
}
function localFingerprints() {
  const fp=new Set(Object.keys(state.seen||{}));
  for(const entry of Object.values(state.library||{}))for(const key of fingerprints(entry.article))fp.add(key);
  // Identifiants hérités de la première version.
  for(const key of Object.keys(state.seen||{}))if(!key.startsWith('id:'))fp.add(key);
  return [...fp];
}
async function fetchSource(topic,source,cutoff,page,key) {
  const isPubmed=source==='pubmed';
  const url=isPubmed?europePmcUrl(topic.query,{cutoff,page,pageSize:75})
    :openAlexUrl(topic.query,{cutoff,page,perPage:75,key});
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error((isPubmed?'Europe PMC':'OpenAlex')+' HTTP '+response.status);
  const data=await response.json();
  return (isPubmed?(data.resultList?.result||[]).map(w=>toEuropePMCArticle(w,topic.name))
    :(data.results||[]).map(w=>toArticle(w,topic.name)))
    .filter(a=>a.abstract.length>35&&a.date&&a.url);
}
async function startSession(form){
  if(loading)return;
  const fd=new FormData(form);
  const ids=fd.getAll('topic');
  const sources=fd.getAll('source').filter(v=>['openalex','pubmed'].includes(v));
  const selected=ids.map(topicById).filter(Boolean);
  if(!selected.length){showToast('Sélectionnez au moins une thématique.');return;}
  if(!sources.length){showToast('Sélectionnez au moins une source bibliographique.');return;}
  const batch=Math.min(50,Math.max(10,Number(fd.get('batch'))||20));
  const periodCount=Number(fd.get('periodCount'));
  const periodUnit=String(fd.get('periodUnit')||'days');
  let cutoff;
  try{cutoff=cutoffFromPeriod(periodCount,periodUnit);}catch(error){showToast(error.message);return;}
  state.prefs.batch=batch;state.prefs.periodCount=periodCount;
  state.prefs.periodUnit=periodUnit;state.prefs.sources=sources;persist();
  loading=true;render();
  const errors=[];
  try{
    // Toujours synchroniser l'intégralité du Zotero lié avant d'annoncer qu'un article est nouveau.
    if(state.prefs.zoteroUser)await syncZoteroLibrary({silent:true});
    const zotero=state.prefs.zoteroUser?state.zoteroIndex.keys:[];
    const seen=localFingerprints();
    const key=sessionStorage.getItem('swipaper-openalex')||'';
    const pools=selected.flatMap(topic=>sources.map(source=>({topic,source,articles:[],exhausted:false})));
    for(let page=1;page<=5;page++){
      const active=pools.filter(p=>!p.exhausted);
      if(!active.length)break;
      const results=await Promise.allSettled(active.map(async p=>fetchSource(p.topic,p.source,cutoff,page,key)));
      results.forEach((result,i)=>{
        if(result.status==='rejected'){
          errors.push(active[i].topic.name+' / '+active[i].source+' : '+(result.reason?.message||'Erreur réseau'));
          active[i].exhausted=true;
        }else{
          active[i].articles.push(...result.value);
          if(result.value.length<10)active[i].exhausted=true;
        }
      });
      const fresh=deduplicate(pools.flatMap(p=>p.articles).sort((a,b)=>b.date.localeCompare(a.date)))
        .filter(a=>isFresh(a,{cutoff,seen,zotero}));
      if(fresh.length>=batch||results.every(r=>r.status==='rejected'))break;
    }
    if(pools.every(p=>p.articles.length===0)){
      throw new Error('Toutes les sources sont indisponibles. '+errors.join(' ; '));
    }
    const merged=deduplicate(pools.flatMap(p=>p.articles).sort((a,b)=>b.date.localeCompare(a.date)))
      .filter(a=>isFresh(a,{cutoff,seen,zotero})).slice(0,batch);
    if(!merged.length)throw new Error('Aucun article inédit avec résumé pour cette période : élargissez-la ou changez les mots-clés.');
    state.active={id:uid(),started:new Date().toISOString(),articles:merged,index:0,actions:[],cutoff,sources};
    state.lastSummary=null;persist();
    if(errors.length)showToast('Résultats partiels : '+errors[0]);
  }catch(error){showToast('Recherche impossible : '+error.message);}
  finally{loading=false;render();}
}
function attachSwipe(){
  const card=el('swipe-card');if(!card)return;
  let pointer=null;
  card.addEventListener('pointerdown',event=>{
    if(event.target.closest('a')||(event.pointerType==='mouse'&&event.target.closest('.abstract')))return;
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
    }
  });
  function end(event){
    if(!pointer||event.pointerId!==pointer.id)return;
    const dx=pointer.dx,dy=pointer.dy;
    pointer=null;card.classList.remove('dragging');card.style.transform='';
    if(Math.abs(dx)>95&&Math.abs(dx)>Math.abs(dy)*1.3)decide(dx>0?'liked':'rejected');
  }
  card.addEventListener('pointerup',end);
  card.addEventListener('pointercancel',()=>{pointer=null;card.style.transform='';card.classList.remove('dragging');});
}
async function checkNewPapers(manual=false) {
  if(alertLoading||!navigator.onLine)return;
  if(!state.topics.length){if(manual)showToast('Créez une thématique pour lancer la veille.');return;}
  const last=state.alerts.lastCheck?Date.parse(state.alerts.lastCheck):0;
  if(!manual&&Date.now()-last<24*3600*1000)return;
  alertLoading=true;if(manual)render();
  try{
    const key=sessionStorage.getItem('swipaper-openalex')||'';
    const results=await Promise.allSettled(state.topics.map(async t=>{
      const response=await fetch(openAlexUrl(t.query,{days:30,perPage:50,key}),{headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('OpenAlex HTTP '+response.status);
      const data=await response.json();
      return (data.results||[]).map(w=>toArticle(w,t.name)).filter(a=>a.abstract.length>35);
    }));
    const ok=results.filter(r=>r.status==='fulfilled');
    if(!ok.length)throw new Error('Sources indisponibles.');
    const found=deduplicate(ok.flatMap(r=>r.value));
    const known=new Set(state.alerts.known||[]);
    const first=!state.alerts.lastCheck;
    const fresh=first?[]:found.filter(a=>!known.has(a.id)&&!state.seen[a.id]);
    state.alerts.known=Array.from(new Set([...known,...found.map(a=>a.id)])).slice(-4000);
    state.alerts.unseen=deduplicate([...(state.alerts.unseen||[]),...fresh]).slice(-100);
    state.alerts.lastCheck=new Date().toISOString();
    persist();
    if(manual)showToast(first?'Veille initialisée : les prochains articles détectés seront signalés.':fresh.length+' nouvelle(s) publication(s) détectée(s).');
    if(ok.length<state.topics.length)showToast('La veille a été partiellement actualisée.');
  }catch(error){if(manual)showToast('Veille indisponible : '+error.message);}
  finally{alertLoading=false;render();}
}

function renderTopics(){
  const cards=state.topics.map(t=>'<article class="topic-card"><div class="icon-tile">◎</div><h3>'+esc(t.name)+'</h3><p>'+esc(t.query)+'</p><div class="bottom"><span class="tag alt">Thématique</span><div class="button-row"><button class="text-btn" data-act="edit-topic" data-id="'+esc(t.id)+'">Modifier</button><button class="text-btn danger" data-act="delete-topic" data-id="'+esc(t.id)+'">Supprimer</button></div></div></article>').join('');
  root.innerHTML=pageIntro('VOS CENTRES D’INTÉRÊT','Chaque curiosité a sa place.','Définissez vos sujets de recherche. Chaque thématique correspond à une requête utilisée pour trouver les publications récentes.',btn('+ Nouvelle thématique','new-topic','primary'))+
    '<div class="cards-grid">'+cards+'<button class="topic-card align-center" data-act="new-topic" style="border-style:dashed;align-items:center;justify-content:center;min-height:190px"><span class="icon-tile">＋</span><strong>Ajouter un sujet</strong><span class="muted tiny">Nouveau champ de recherche</span></button></div>';
}
function openTopicModal(id=''){
  const t=topicById(id)||{id:'',name:'',query:''};
  const layer=document.createElement('div');layer.className='modal-layer';layer.id='modal-layer';
  layer.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">'+(t.id?'Modifier':'Créer')+' une thématique</h2><p>Définissez le nom et les mots-clés utilisés pour rechercher les publications.</p>'+
    '<form id="topic-form" class="form-stack"><input type="hidden" name="id" value="'+esc(t.id)+'"><div class="field"><label for="topic-name">Nom de la thématique</label><input id="topic-name" name="name" maxlength="70" required value="'+esc(t.name)+'" placeholder="Ex. Attention visuelle"></div>'+
    '<div class="field"><label for="topic-query">Mots-clés de recherche</label><textarea id="topic-query" name="query" required maxlength="300" placeholder="Ex. visual attention cognitive control">'+esc(t.query)+'</textarea><small>Privilégiez les termes en anglais pour une recherche bibliographique étendue.</small></div>'+
    '<div class="actions"><button class="btn secondary" type="button" data-act="close-modal">Annuler</button><button type="submit" class="btn">Enregistrer</button></div></form></div>';
  document.body.appendChild(layer);el('topic-name').focus();
}
function renderLibrary(){
  const all=Object.values(state.library);
  const chosen=all.filter(x=>x.status===libraryFilter).sort((a,b)=>b.updated.localeCompare(a.updated));
  const tabs=[['liked','Intéressants'],['later','À lire plus tard']];
  const header=pageIntro('VOTRE BIBLIOTHÈQUE','Des articles qui comptent.','Retrouvez les publications sauvegardées au cours de vos sessions.',
    '<div class="button-row">'+btn('↓ Exporter RIS','export-library-ris','secondary small')+btn('↓ Exporter CSV','export-library-csv','secondary small')+btn('↗ Zotero','zotero-library','primary small')+'</div>');
  root.innerHTML=header+'<div class="filters">'+tabs.map(([key,label])=>'<button class="chip '+(key===libraryFilter?'active':'')+'" data-act="library-filter" data-filter="'+key+'">'+label+' · '+all.filter(x=>x.status===key).length+'</button>').join('')+'</div>'+
    (chosen.length?'<div class="list-stack">'+chosen.map(({article:a,status})=>'<article class="list-card"><div><h3>'+esc(a.title)+'</h3><p>'+esc(a.authors.slice(0,3).join(', '))+' · '+esc(a.journal)+' · '+esc(a.year||'')+'</p><div class="meta"><span>'+esc(a.topic)+'</span>'+(a.doi?'<a target="_blank" rel="noopener noreferrer" href="'+esc(a.url)+'">↗ DOI : '+esc(a.doi)+'</a>':'')+(a.pdf?'<a target="_blank" rel="noopener noreferrer" href="'+esc(a.pdf)+'">↗ PDF</a>':'')+'</div></div><div class="button-row">'+(status==='later'?btn('Conserver','promote','secondary small','data-id="'+esc(a.id)+'"'):'')+btn('Retirer','remove-library','ghost small','data-id="'+esc(a.id)+'"')+'</div></article>').join('')+'</div>':empty('Aucun article dans cette catégorie','Commencez une session et glissez les articles qui vous intéressent vers la droite.','go-discover','Découvrir'));
}
function renderHistory(){
  const sessions=state.history;
  root.innerHTML=pageIntro('VOTRE PARCOURS','Vos sessions, en mémoire.','Consultez vos précédentes explorations et exportez les références sélectionnées.')+
    (sessions.length?'<div class="list-stack">'+sessions.map(s=>{
      const c=counts(s.actions);
      return '<article class="list-card"><div><h3>Session du '+esc(new Date(s.started).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'}))+'</h3><p>'+s.actions.length+' articles examinés · '+c.liked+' conservés · '+c.later+' à revoir · '+c.rejected+' écartés</p><span class="tag alt">'+esc(new Date(s.started).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}))+'</span></div><div class="button-row">'+btn('RIS','history-ris','secondary small','data-id="'+esc(s.id)+'"')+btn('E-mail','history-email','secondary small','data-id="'+esc(s.id)+'"')+'</div></article>';
    }).join('')+'</div>':empty('Votre historique est vide','Les sessions terminées apparaîtront ici.','go-discover','Démarrer une session'));
}
function renderSettings(){
  root.innerHTML=pageIntro('PRÉFÉRENCES','Un espace à votre image.','Personnalisez vos intégrations et les options de votre veille scientifique.')+
    '<div class="session-setup"><div class="panel"><h2 class="section-title">Connexion Zotero</h2><p class="muted tiny" style="line-height:1.8">Pour ajouter les références à votre bibliothèque, utilisez votre identifiant numérique Zotero et une clé API autorisée à écrire. La clé n’est conservée que pendant la session de votre navigateur.</p>'+
    '<form id="settings-form" class="form-stack"><div class="field"><label for="zotero-user">Identifiant numérique Zotero</label><input id="zotero-user" name="zoteroUser" inputmode="numeric" pattern="[0-9]*" placeholder="Identifiant de bibliothèque" value="'+esc(state.prefs.zoteroUser)+'"></div>'+
    '<div class="field"><label for="zotero-key">Clé API Zotero (temporaire)</label><input id="zotero-key" name="zoteroKey" type="password" autocomplete="off" placeholder="À saisir pour autoriser l’envoi" value=""><small>La clé n’est ni enregistrée sur GitHub, ni conservée dans la sauvegarde locale.</small></div>'+
    '<div class="field"><label for="zotero-collection">Clé de collection Zotero (facultative)</label><input id="zotero-collection" name="zoteroCollection" maxlength="8" placeholder="Ex. ABCD1234" value="'+esc(state.prefs.zoteroCollection)+'"></div>'+
    '<div class="field"><label for="openalex-key">Clé API OpenAlex (facultative)</label><input id="openalex-key" name="openalexKey" type="password" autocomplete="off" placeholder="Pour relever les limites d’accès" value=""><small>Sans clé, les recherches gratuites restent possibles sous réserve des limites de l’API.</small></div>'+
    '<button class="btn" type="submit">Enregistrer les préférences</button></form></div>'+
    '<div class="soft-panel"><p class="eyebrow">CONFIDENTIALITÉ</p><h2 class="section-title">Vos données restent ici.</h2><p class="tiny muted" style="line-height:1.9">Les thématiques, les décisions et les sessions sont enregistrées localement sur cet appareil. Il n’existe pas encore de compte Swipaper ou de synchronisation entre appareils. Les clés temporaires restent uniquement dans le stockage de session du navigateur.</p><div class="divider"></div><div class="button-row">'+btn('Sauvegarder mes données','backup','secondary small')+btn('Importer une sauvegarde','restore','secondary small')+'</div><div class="divider"></div><p class="tiny muted">La restauration remplace les données locales de cet appareil.</p></div></div>';
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
  if(act==='like')decide('liked');
  if(act==='reject')decide('rejected');
  if(act==='later')decide('later');
  if(act==='undo')undo();
  if(act==='finish'){if(confirm('Terminer cette session maintenant ? Les articles non examinés ne seront pas comptabilisés.'))finishSession();}
  if(act==='reset-summary'){state.lastSummary=null;saveAndRender();}
  if(act==='go-discover')navigate('discover');
  if(act==='library-filter'){libraryFilter=button.dataset.filter;render();}
  if(act==='new-topic')openTopicModal();
  if(act==='edit-topic')openTopicModal(id);
  if(act==='delete-topic'){
    const t=topicById(id);
    if(t&&confirm('Supprimer la thématique « '+t.name+' » ?')){state.topics=state.topics.filter(x=>x.id!==id);saveAndRender();}
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
document.addEventListener('submit',event=>{
  event.preventDefault();
  const form=event.target;
  if(form.id==='session-form')startSession(form);
  if(form.id==='topic-form'){
    const name=form.elements.name.value.trim(),query=form.elements.query.value.trim(),id=form.elements.id.value;
    if(!name||!query){showToast('Nom et mots-clés obligatoires.');return;}
    if(id){const t=topicById(id);if(t){t.name=name;t.query=query;}}
    else state.topics.push({id:uid(),name,query});
    el('modal-layer')?.remove();saveAndRender();
  }
  if(form.id==='settings-form'){
    state.prefs.zoteroUser=form.elements.zoteroUser.value.trim();
    state.prefs.zoteroCollection=form.elements.zoteroCollection.value.trim().toUpperCase();
    if(form.elements.zoteroKey.value.trim())sessionStorage.setItem('swipaper-zotero',form.elements.zoteroKey.value.trim());
    if(form.elements.openalexKey.value.trim())sessionStorage.setItem('swipaper-openalex',form.elements.openalexKey.value.trim());
    saveAndRender();showToast('Préférences enregistrées sur cet appareil.');
  }
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape')el('modal-layer')?.remove();
  if(view!=='discover'||!state.active||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target.matches('input,textarea,select,[contenteditable]')||event.target.closest('.modal-layer'))return;
  if(event.key==='ArrowLeft'){event.preventDefault();decide('rejected');}
  if(event.key==='ArrowRight'){event.preventDefault();decide('liked');}
  if(event.key==='ArrowDown'){event.preventDefault();decide('later');}
  if(event.key==='Backspace'){event.preventDefault();undo();}
});
window.addEventListener('hashchange',()=>{view=TITLES[location.hash.slice(1)]?location.hash.slice(1):'discover';render();});
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
