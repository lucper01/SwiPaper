import test from 'node:test';
import assert from 'node:assert/strict';
import {abstractFromIndex,cleanDoi,safeUrl,toArticle,toEuropePMCArticle,deduplicate,asRIS,asCSV,zoteroItem,openAlexUrl,europePmcUrl,cutoffFromPeriod,fingerprints,zoteroFingerprints,isFresh,normalizeTitle,risFingerprints} from '../src/core.mjs';
test('reconstruct abstract',()=>{assert.equal(abstractFromIndex({world:[1],hello:[0]}),'hello world');assert.equal(abstractFromIndex(null),'');});
test('identifiers and URL sanitizing',()=>{assert.equal(cleanDoi('https://doi.org/10.1234/ABC'),'10.1234/ABC');assert.equal(safeUrl('javascript:alert(1)'),'');});
test('publication period using calendar days, months and years',()=>{
  const today=new Date('2026-10-16T12:00:00Z');
  assert.equal(cutoffFromPeriod(30,'days',today),'2026-09-16');
  assert.equal(cutoffFromPeriod(2,'months',today),'2026-08-16');
  assert.equal(cutoffFromPeriod(1,'years',today),'2025-10-16');
  assert.equal(cutoffFromPeriod(1,'months',new Date('2026-03-31T12:00:00Z')),'2026-02-28');
  assert.throws(()=>cutoffFromPeriod(0,'days'),/période/);
});
test('OpenAlex and PubMed / Europe PMC URLs are publication-date filtered',()=>{
  const a=new URL(openAlexUrl('vision',{cutoff:'2026-09-16',page:2}));
  assert.equal(a.searchParams.get('search'),'vision');assert.match(a.searchParams.get('filter'),/2026-09-16/);
  const b=new URL(europePmcUrl('olfactory perception',{cutoff:'2026-09-16',page:3}));
  assert.match(b.searchParams.get('query'),/FIRST_PDATE:\[2026-09-16 TO/);
  assert.equal(b.searchParams.get('resultType'),'core');assert.equal(b.searchParams.get('page'),'3');
});
test('cross-source conversion, deduplication and article freshness',()=>{
  const open=toArticle({id:'https://openalex.org/W123',doi:'https://doi.org/10.5555/ABC',title:'Multisensory temporal integration in cognitive neuroscience',authorships:[{author:{display_name:'Ada Lovelace'}}],abstract_inverted_index:{A:[0],test:[1]},publication_date:'2026-10-01',primary_location:{source:{display_name:'Journal'}}},'Cognition');
  const pub=toEuropePMCArticle({id:'12345678',pmid:'12345678',doi:'10.5555/ABC',title:'Multisensory temporal integration in cognitive neuroscience',abstractText:'<h2>Methods</h2><p>A test</p>',firstPublicationDate:'2026-10-01',journalTitle:'Journal',authorString:'Ada Lovelace',pubYear:'2026'},'Cognition');
  assert.equal(open.abstract,'A test');assert.equal(pub.abstract,'Methods A test');assert.equal(pub.pmid,'12345678');
  assert.equal(deduplicate([pub,open]).length,1);
  assert.equal(isFresh(open,{cutoff:'2026-09-01'}),true);
  assert.equal(isFresh(open,{cutoff:'2026-10-10'}),false);
  assert.equal(isFresh(open,{cutoff:'2026-09-01',zotero:zoteroFingerprints({data:{title:pub.title,DOI:'10.5555/ABC'}})}),false);
  assert.match(asRIS([open]),/DO  - 10.5555\/ABC/);
  assert.match(asCSV([open]),/"pmid"/);
  assert.equal(zoteroItem(pub,'ABCDEFGH').extra,'PMID: 12345678');
  assert.ok(fingerprints(pub).includes('pmid:12345678'));
  assert.equal(normalizeTitle('hi'),'');
});
test('Zotero title-based fallback matches papers without DOI',()=>{
  const a={id:'pmid:444',date:'2026-10-01',title:'Neural correlates of olfactory perception and attention',pmid:'444'};
  const z=zoteroFingerprints({data:{title:'Neural correlates of olfactory perception and attention',DOI:''}});
  assert.equal(isFresh(a,{cutoff:'2026-09-01',zotero:z}),false);
});

test('RIS library import excludes article DOI and title',()=>{
  const input='TY  - JOUR\nTI  - Olfactory perception and neural attention mechanisms\nDO  - 10.1234/ABC\nER  - \nTY  - JOUR\nTI  - Crossmodal temporal binding in visual perception\nER  - \n';
  const result=risFingerprints(input);
  assert.equal(result.count,2);
  assert.ok(result.keys.includes('doi:10.1234/abc'));
  assert.ok(result.keys.includes('title:crossmodal temporal binding in visual perception'));
});
