import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ReviewDirectory from '../../components/review-directory';
import {SiteProvider} from '../../components/site-context';
import type {SiteData} from '../site-types';

// Isolated synthetic fixture: never imported as customer content or seeded into a database.
const fixture:SiteData={pages:Array.from({length:82},(_,i)=>({
 slug:'synthetic-review-'+i,title:'qa_reviewer_'+i,kind:'review',seo:{},
 content:{source_number:i+1,body:`Synthetic review ${i}: communication and delivery review. The complete final sentence remains visible for record ${i}.`,rating:i%3===0?4.7:5,category:i%2?'Mobile engineering':'Web engineering',platform:'Fiverr',platform_verified:i!==81},
}))};
test('review directory initially renders every published fixture beyond the former twelve-card page limit',()=>{
 const html=renderToStaticMarkup(SiteProvider({initial:fixture,children:createElement(ReviewDirectory)}));
 assert.equal((html.match(/class="review-card"/g)||[]).length,82);
 assert.match(html,/82 client reviews/);
 for(let i=0;i<82;i++){
  assert.ok(html.includes(`qa_reviewer_${i}</strong>`));
  assert.ok(html.includes(`The complete final sentence remains visible for record ${i}.`));
 }
 assert.doesNotMatch(html,/>Previous<|>Next<|>Load [Mm]ore<|Page \d+ of/);
 assert.match(html,/4\.7 \/ 5/);assert.match(html,/Client Review/);
 assert.match(html,/Search reviews/);assert.match(html,/All sources/);assert.match(html,/All ratings/);assert.match(html,/All services/);assert.match(html,/Rating: high to low/);
});
