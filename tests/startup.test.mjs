import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

// Ensure the application actually reaches its first render. Syntax checks alone
// cannot catch missing DOM nodes, initialization failures, or undefined helpers.
function startApp(){
 const source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8')
   .replace(/^import\s+.+?;\s*$/gm,'');
 const registry=new Map();
 const makeNode=(id)=>({
  id,innerHTML:'',textContent:'',hidden:false,dataset:{},
  style:{},
  classList:(()=>{
    const classes=new Set();
    return {toggle(name,force){if(force===undefined? !classes.has(name):force)classes.add(name);else classes.delete(name)},
      add(name){classes.add(name)},remove(name){classes.delete(name)},contains(name){return classes.has(name)}};
  })(),
  addEventListener(){},setAttribute(){},appendChild(){},remove(){},
  matches(){return false},closest(){return null}
 });
 for(const id of ['view','toast','breadcrumb','saved-count','online-label','online-dot','install-button'])
  registry.set(id,makeNode(id));
 const doc={
  querySelector(sel){return registry.get(sel.slice(1))||null;},
  querySelectorAll(){return [];},
  getElementById(id){return registry.get(id)||null;},
  addEventListener(){},createElement(){return makeNode('created')},
  body:{appendChild(){}}
 };
 const local={getItem(){return null},setItem(){},removeItem(){}};
 const context=vm.createContext({
  document:doc,window:{addEventListener(){},scrollTo(){},matchMedia(){return {matches:false}}},
  location:{hash:'',href:'https://example.test/SwiPaper/'},
  localStorage:local,sessionStorage:local,
  navigator:{onLine:false},structuredClone,crypto:webcrypto,
  URL,URLSearchParams,Date,Math,Number,String,Object,Array,Set,Map,
  setTimeout,clearTimeout,console,confirm(){return true},
  // Imported functions are not called during a healthy first render.
  themeScope(){return 'title_abstract'}
 });
 vm.runInContext(source,context,{filename:'src/app.js',timeout:2000});
 return {context,registry};
}
test('Initial discovery screen replaces the startup placeholder',()=>{
 const {registry}=startApp();
 const html=registry.get('view').innerHTML;
 assert.match(html,/Rechercher des articles/);
 assert.match(html,/session-form/);
 assert.doesNotMatch(html,/Préparation de votre espace/);
});
test('Primary navigation renders without crashing',()=>{
 const {context,registry}=startApp();
 for(const page of ['topics','library','history','settings']){
  vm.runInContext("view='"+page+"';render();",context,{timeout:1500});
  assert.ok(registry.get('view').innerHTML.length>300,'Page '+page+' renders');
 }
});

test('Returning to Discover after a completed session resets the discovery panel only',()=>{
 const {context,registry}=startApp();
 vm.runInContext("state.lastSummary={id:'s1',started:'2026-10-30',ended:'2026-10-30',actions:[]};showCompletion=true;render();",context);
 assert.match(registry.get('view').innerHTML,/Session terminée/);
 vm.runInContext("navigate('library');navigate('discover');",context);
 assert.match(registry.get('view').innerHTML,/session-form/);
 assert.doesNotMatch(registry.get('view').innerHTML,/Session terminée/);
 assert.equal(vm.runInContext('state.lastSummary.id',context),'s1');
});
test('New session button returns to search, preserving previous history',()=>{
 const {context,registry}=startApp();
 vm.runInContext("state.lastSummary={id:'s1',started:'2026-10-30',ended:'2026-10-30',actions:[]};state.history=[state.lastSummary];showCompletion=true;state.lastSummary=null;showCompletion=false;render();",context);
 assert.match(registry.get('view').innerHTML,/session-form/);
 assert.equal(vm.runInContext('state.history.length',context),1);
});

test('Active session uses viewport layout and keeps other screens unaffected',()=>{
 const {context,registry}=startApp();
 vm.runInContext("state.active={id:'example',started:'2026-10-30',articles:[{id:'doi:10.1234/a',title:'Experimental olfactory temporal perception',authors:['A Researcher'],abstract:'An empirical abstract',year:2026,source:'OpenAlex'}],index:0,actions:[]};render();",context);
 assert.match(registry.get('view').innerHTML,/swipe-scene/);
 assert.match(registry.get('view').innerHTML,/swipe-card/);
 assert.match(registry.get('view').innerHTML,/giraffe-motion/);
});

test('Session viewport class is applied only while Discover has an active session',()=>{
 const {context,registry}=startApp();
 const root=registry.get('view');
 assert.equal(root.classList.contains('session-layout'),false);
 vm.runInContext("state.active={id:'s1',articles:[{id:'item',title:'Effects of attention on olfaction',authors:['A'],abstract:'Experimental investigation',year:2026}],index:0,actions:[]};render();",context);
 assert.equal(root.classList.contains('session-layout'),true);
 vm.runInContext("view='library';render();",context);
 assert.equal(root.classList.contains('session-layout'),false);
});
test('Tablet media query returns to natural scrolling rather than clipping stacked panels',()=>{
 const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 assert.match(css,/@media\(min-width:721px\) and \(max-width:900px\)/);
 assert.match(css,/#view\.session-layout\s*\{\s*height:auto;/);
});
