import test from 'node:test';
import assert from 'node:assert/strict';
import {bibtexFingerprints,scholarSearchUrl,scholarProxyUrl} from '../src/scholar.mjs';
test('Scholar link uses supplied keywords',()=>{
  const url=new URL(scholarSearchUrl('olfactory attention'));
  assert.equal(url.hostname,'scholar.google.com');
  assert.equal(url.searchParams.get('q'),'olfactory attention');
});
test('BibTeX import recognizes identifiers and nested titles',()=>{
 const src='@article{one, title={Olfactory {Attention} and Visual Processing}, doi={10.1234/TEST}, year={2024}}\\n@misc{two,title = "A study of multisensory perception", url={https://example.org/article}}';
 const parsed=bibtexFingerprints(src);
 assert.equal(parsed.count,2);
 assert.ok(parsed.keys.includes('doi:10.1234/test'));
 assert.ok(parsed.keys.some(x=>x.includes('olfactory attention and visual processing')));
});
test('empty BibTeX import produces no phantom records',()=>{
 assert.equal(bibtexFingerprints('not bibtex').count,0);
});

test('Optional Scholar proxy requires HTTPS and forwards search parameters',()=>{
 const u=new URL(scholarProxyUrl('https://example.workers.dev','olfaction','2026-10-01',2));
 assert.equal(u.pathname,'/api/scholar');
 assert.equal(u.searchParams.get('q'),'olfaction');
 assert.equal(u.searchParams.get('page'),'2');
 assert.throws(()=>scholarProxyUrl('http://example.com','x','2026-10-01'));
});
