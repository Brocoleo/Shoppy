import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArchive, parseHero, isPublicProduct } from '../packages/shared/src/editorial.ts';
const image={storagePath:'vinta/archive/batch/photo.webp',width:800,height:1200,alt:'Prenda del archivo'};
const item={id:'abc',slug:'instagram-abc',title:'Archivo',sourceUrl:'https://www.instagram.com/vinta.zhe/p/abc/',publishedAt:'2023-01-01T00:00:00Z',visible:true,images:[image]};
test('archive keeps images and provenance, never commercial fields',()=>{const archive=parseArchive({batch:'test',items:[{...item,priceClp:10,stock:1}]});assert.equal(archive.items.length,1);assert.equal('priceClp' in archive.items[0],false);assert.equal('stock' in archive.items[0],false)});
test('rejects traversal, external photos and foreign source URLs',()=>{for(const bad of [{...item,sourceUrl:'https://evil.test/'},{...item,images:[{...image,storagePath:'vinta/archive/../secret.webp'}]},{...item,images:[{...image,storagePath:'https://evil.test/photo.webp'}]}])assert.equal(parseArchive({items:[bad]}).items.length,0)});
test('duplicates are discarded and visibility defaults to hidden',()=>{const result=parseArchive({items:[{...item,visible:undefined},item]});assert.equal(result.items.length,1);assert.equal(result.items[0].visible,false)});
test('hero rejects external action and preserves known image framing',()=>{const result=parseHero({ctaHref:'//evil.test',primary:{...image,fit:'cover',position:'top'}});assert.equal(result.ctaHref,'/catalogo');assert.equal(result.primary.fit,'cover');assert.equal(result.primary.position,'top')});
test('hides only explicit demos and keeps real inventory public',()=>{assert.equal(isPublicProduct({id:'d0000000-0000-4000-8000-000000000001'}),false);assert.equal(isPublicProduct({id:'real'}),true);assert.equal(isPublicProduct({id:'real',metadata:{demo:true}}),false);assert.equal(isPublicProduct({id:'real',isDemo:true}),false)});

test("examples are never commercial even when published elsewhere",()=>{assert.equal(isPublicProduct({metadata:{example:true}}),false);assert.equal(isPublicProduct({metadata:{example:false}}),true)});
