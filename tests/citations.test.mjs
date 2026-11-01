import test from 'node:test';
import assert from 'node:assert/strict';
import {openAlexWorkId,citationLookupUrl,citationNeighborsUrl,batchWorksUrl,graphNode,buildCitationGraph,citationLayout,filterCitationGraph} from '../src/citations.mjs';
const work=(id,title,year)=>({id:'https://openalex.org/'+id,display_name:title,publication_year:year,authorships:[{author:{display_name:'Researcher'}}]});
test('identifiers and lookups use real OpenAlex filters',()=>{
 assert.equal(openAlexWorkId('https://openalex.org/W2741809807'),'W2741809807');
 assert.equal(openAlexWorkId('doi:10.1/abcd'),'');
 assert.equal(new URL(citationLookupUrl({doi:'10.1234/ABC'})).searchParams.get('filter'),'doi:https://doi.org/10.1234/ABC');
 assert.equal(new URL(citationLookupUrl({openAlexId:'https://openalex.org/W2741809807'})).pathname,'/works/W2741809807');
 assert.equal(new URL(citationNeighborsUrl('W2741809807','citing')).searchParams.get('filter'),'cites:W2741809807');
 assert.equal(new URL(batchWorksUrl(['W2100837269','W2134720587','W2100837269'])).searchParams.get('filter'),'openalex:W2100837269|W2134720587');
 assert.equal(citationLookupUrl({}), '');
});
test('network edges correctly distinguish cited papers and citing papers',()=>{
 const seed=work('W2741809807','Central paper',2023);
 const cited=work('W2100837269','Reference article',2019);
 const citing=work('W2134720587','Newer article',2025);
 const related=work('W3333333333','Similar article',2024);
 const graph=buildCitationGraph(seed,{references:[cited,cited],citing:[citing],related:[related]});
 assert.equal(graph.nodes.length,4);
 assert.equal(graph.totals.references,1);
 assert.deepEqual(graph.edges.map(x=>[x.source,x.target,x.type]),[
 ['W2741809807','W2100837269','references'],['W2134720587','W2741809807','citing'],['W2741809807','W3333333333','related']
 ]);
 assert.deepEqual(citationLayout(graph)[graph.seed],{x:500,y:260});
 assert.ok(graphNode(seed).url.includes('openalex.org'));
});
test('citation model handles empty and partial networks without invented nodes',()=>{
 const graph=buildCitationGraph(work('W2741809807','Orphan paper',2024));
 assert.equal(graph.nodes.length,1);
 assert.equal(graph.edges.length,0);
 assert.equal(graph.totals.citing,0);
 assert.throws(()=>buildCitationGraph({id:'bad'}));
});

test('network adds actual cross-citation edges without inventing relationships',()=>{
 const central=work('W2741809807','Main paper',2025);
 const first=work('W2100837269','First cited paper',2020);
 const second=work('W2134720587','Second cited paper',2021);
 first.referenced_works=['https://openalex.org/W2134720587'];
 const g=buildCitationGraph(central,{references:[first,second]});
 assert.ok(g.edges.some(e=>e.source==='W2100837269'&&e.target==='W2134720587'&&e.type==='citation'));
 assert.ok(!g.edges.some(e=>e.source==='W2134720587'&&e.target==='W2100837269'));
});

test('Citation filters show only requested relationship types and preserve original graph',()=>{
 const seed=work('W2741809807','Central',2025);
 const reference=work('W2100837269','Reference',2022);
 const citing=work('W2134720587','Citing',2026);
 const related=work('W3333333333','Similar',2024);
 reference.referenced_works=['https://openalex.org/W3333333333'];
 const graph=buildCitationGraph(seed,{references:[reference],citing:[citing],related:[related]});
 const filtered=filterCitationGraph(graph,{references:true,citing:false,related:false});
 assert.equal(filtered.nodes.length,2);
 assert.equal(filtered.totals.citing,0);
 assert.ok(filtered.nodes.every(n=>n.id!=='W2134720587'&&n.id!=='W3333333333'));
 assert.equal(filtered.edges.filter(e=>e.type==='citation').length,0);
 assert.equal(graph.nodes.length,4);
 assert.equal(graph.totals.citing,1);
 assert.equal(filterCitationGraph(graph,{references:false,citing:false,related:false}).nodes.length,1);
});
