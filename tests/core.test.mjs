import test from 'node:test';
import assert from 'node:assert/strict';
import {abstractFromIndex,cleanDoi,safeUrl,toArticle,deduplicate,asRIS,asCSV,zoteroItem,openAlexUrl} from '../src/core.mjs';
test('reconstruct abstract',()=>{assert.equal(abstractFromIndex({world:[1],hello:[0]}),'hello world');assert.equal(abstractFromIndex(null),'');});
test('identifiers and URLs',()=>{assert.equal(cleanDoi('https://doi.org/10.1234/ABC'),'10.1234/ABC');assert.equal(safeUrl('javascript:alert(1)'),'');});
test('conversion and exports',()=>{
  const work={id:'https://openalex.org/W123',doi:'https://doi.org/10.1234/ABC',title:'Test Paper',authorships:[{author:{display_name:'Ada Lovelace'}}],abstract_inverted_index:{A:[0],test:[1]},primary_location:{source:{display_name:'Journal'}}};
  const a=toArticle(work,'Attention');
  assert.equal(a.abstract,'A test');assert.equal(a.id,'doi:10.1234/abc');
  assert.equal(deduplicate([a,a]).length,1);
  assert.match(asRIS([a]),/DO  - 10.1234\/ABC/);assert.match(asCSV([a]),/"doi"/);
  assert.equal(zoteroItem(a,'ABCDEFGH').collections[0],'ABCDEFGH');
});
test('OpenAlex query',()=>{const u=new URL(openAlexUrl('vision',{days:30,page:2}));assert.equal(u.searchParams.get('search'),'vision');assert.equal(u.searchParams.get('page'),'2');});
