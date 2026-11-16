import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PortfolioDirectory from '../../components/portfolio-showcase';
import {SiteProvider} from '../../components/site-context';
import type {SiteData} from '../site-types';

test('work directory includes every project in a large collection on its initial render',()=>{
 const fixture:SiteData={pages:Array.from({length:150},(_,i)=>({slug:'portfolio/synthetic-project-'+i,title:'Synthetic project '+i,kind:'portfolio',seo:{},content:{description:'Isolated local test fixture only.',category:i%2?'AI Engineering':'Web & SaaS Applications',technologies:['TypeScript'],featured:i===0}}))};
 const html=renderToStaticMarkup(SiteProvider({initial:fixture,children:createElement(PortfolioDirectory)}));
 assert.equal((html.match(/class="portfolio-card"/g)||[]).length,150);
 assert.match(html,/150 documented entries/);
 for(let i=0;i<150;i++)assert.ok(html.includes('href="/portfolio/synthetic-project-'+i+'"'));
 assert.doesNotMatch(html,/>Previous<|>Next<|>Load [Mm]ore<|Page \d+ of/);
 assert.match(html,/Search previous work/);assert.match(html,/All work/);assert.match(html,/All technologies/);
});
