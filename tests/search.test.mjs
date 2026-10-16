import test from 'node:test';
import assert from 'node:assert/strict';
import {parseScientificQuery,compileScientificQuery,evaluateScientificArticle,tokenizeSearch,themeScope} from '../src/search.mjs';
test('AND implicit and explicit restricts matches',()=>{
  const ast=parseScientificQuery('olfaction temporal integration');
  assert.equal(evaluateScientificArticle({title:'Olfaction and temporal integration',abstract:''},ast).matches,true);
  assert.equal(evaluateScientificArticle({title:'Temporal integration in auditory processing',abstract:''},ast).matches,false);
  assert.equal(evaluateScientificArticle({title:'Olfaction',abstract:'Temporal integration'},ast).matches,true);
});
test('OR alternatives and quoted phrases preserve the logical relation',()=>{
  const ast=parseScientificQuery('("boundary extension" OR "boundary restriction") AND olfaction');
  assert.equal(evaluateScientificArticle({title:'Boundary extension and olfaction',abstract:''},ast).matches,true);
  assert.equal(evaluateScientificArticle({title:'Boundary restriction in hearing',abstract:'Olfaction'},ast).matches,true);
  assert.equal(evaluateScientificArticle({title:'Boundary extension',abstract:'No smell studies'},ast).matches,false);
  assert.equal(evaluateScientificArticle({title:'Boundary',abstract:'Extension and olfaction'},ast).matches,false);
});
test('NOT excludes and title-only mode is respected',()=>{
  const ast=parseScientificQuery('olfaction AND "temporal perception" NOT review');
  assert.equal(evaluateScientificArticle({title:'Olfaction and temporal perception',abstract:'This article is a review'},ast).matches,false);
  assert.equal(evaluateScientificArticle({title:'Olfaction and temporal perception',abstract:'Experiment with humans'},ast,'title').matches,true);
  assert.equal(evaluateScientificArticle({title:'Olfaction',abstract:'We investigated temporal perception'},ast,'title').matches,false);
  assert.equal(evaluateScientificArticle({title:'Olfaction',abstract:'We investigated temporal perception'},ast,'title_abstract').matches,true);
});
test('title presence boosts score without claiming a probabilistic match',()=>{
  const ast=parseScientificQuery('olfaction AND attention');
  const inTitle=evaluateScientificArticle({title:'Olfaction and attention',abstract:''},ast);
  const inAbstract=evaluateScientificArticle({title:'ERP study',abstract:'Olfaction and attention were measured'},ast);
  assert.ok(inTitle.score>inAbstract.score);
  assert.deepEqual(inTitle.titleMatched,['olfaction','attention']);
});
test('reject incomplete, unbalanced, purely negative and oversized searches',()=>{
  for(const q of ['olfaction AND','(olfaction OR attention','NOT olfaction','olfaction OR','olfaction )', '"unfinished']){
    assert.throws(()=>parseScientificQuery(q),undefined,q);
  }
  assert.throws(()=>parseScientificQuery('a'.repeat(401)));
  assert.equal(tokenizeSearch('olfaction AND EEG').tokens.length,3);
});
test('query translation to providers scopes title and abstract',()=>{
  const query='(olfaction OR odor) AND "temporal integration" NOT review';
  const a=compileScientificQuery(query,'openalex');
  const b=compileScientificQuery(query,'europepmc','title');
  const c=compileScientificQuery(query,'europepmc','title_abstract');
  assert.match(a,/OR/);assert.match(a,/NOT/);
  assert.match(b,/TITLE:"olfaction"/);assert.match(b,/TITLE:"temporal integration"/);
  assert.match(c,/TITLE:"olfaction"/);assert.match(c,/ABSTRACT:"olfaction"/);
  assert.equal(themeScope({scope:'title'}),'title');
  assert.equal(themeScope({}),'title_abstract');
});

test('Strict query scope prevents unrelated articles when a provider returns broad matches',()=>{
  const ast=parseScientificQuery('(olfaction OR smell) AND (vision OR audition) NOT review');
  const list=[
    {title:'Audition and olfaction in multisensory integration',abstract:'A new experimental study'},
    {title:'Olfaction under anesthesia',abstract:'A controlled study'},
    {title:'Visual integration in reviews',abstract:'Review of olfaction'},
  ];
  assert.deepEqual(list.map(a=>evaluateScientificArticle(a,ast).matches),[true,false,false]);
});
