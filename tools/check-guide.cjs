#!/usr/bin/env node
// Run from the repository root: node tools/check-guide.cjs [index.html]
// Uses Node built-ins only. Checks the guide actually packaged in the app.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const crypto=require('node:crypto');
const file=process.argv[2]||path.resolve(__dirname,'../index.html');
const app=fs.readFileSync(file,'utf8');
const frameStart=app.indexOf('<iframe id="fit-frame"');
assert(frameStart>=0,'Guide frame missing');
const start=app.indexOf('srcdoc="',frameStart)+8;
const end=app.indexOf('"',start);
const guide=app.slice(start,end).replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const dataStart=guide.indexOf('const FITMENT_DB = ')+'const FITMENT_DB = '.length;
assert(dataStart>20,'Guide database missing');
let depth=0,inString=false,escaped=false,dataEnd=-1;
for(let i=dataStart;i<guide.length;i++){
  const c=guide[i];
  if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue;}
  if(c==='"'){inString=true;continue;}
  if(c==='[')depth++;
  if(c===']'&&!--depth){dataEnd=i+1;break;}
}
assert(dataEnd>dataStart,'Unterminated guide database');
const db=JSON.parse(guide.slice(dataStart,dataEnd));
const models=db.flatMap(b=>b.models);
const setups=models.flatMap(m=>m.groups.flatMap(g=>g.setups));
const alternatives=setups.flatMap(s=>s.alts||[]);
const setupIds=new Set(),altIds=new Set();
let axles=0;
const tyre=/^(\d{2,3})\/(\d{2,3})[-R](\d{2})$/;
const wheel=/^(\d{2})[×x](\d+(?:\.\d+)?)$/;
for(const m of models)assert(m.groups.some(g=>g.setups.length),'Empty model: '+m.name+' '+m.chassis);
for(const s of setups){assert(s._id&&!setupIds.has(s._id),'Duplicate setup id');setupIds.add(s._id);}
for(const a of alternatives){assert(a._id&&!altIds.has(a._id),'Duplicate alternative id');altIds.add(a._id);assert(['tire','wheel'].includes(a.type),'Untyped alternative');}
for(const s of [...setups,...alternatives]){
  assert(!Object.hasOwn(s,'tire'),'Free-text tyre alternative remains');
  for(const axis of ['front','rear']){
    const a=s[axis],w=wheel.exec(a.size),t=tyre.exec(a.tire);
    assert(w&&t,'Unparsed axle: '+s._id+' '+axis);
    assert.equal(w[1],t[3],'Tyre/rim diameter mismatch: '+s._id+' '+axis);
    assert(/^ET[+-]?\d+(?:\.\d+)?(?:\s*\/\s*(?:ET)?[+-]?\d+(?:\.\d+)?)*$/.test(a.et),'Unparsed offset');
    axles++;
  }
}
const bmw=db.find(b=>b.make==='BMW');
const get=(make,name,chassis)=>db.find(b=>b.make===make).models.find(m=>m.name===name&&m.chassis===chassis);
const byId=Object.fromEntries(setups.map(s=>[s._id,s]));
const altById=Object.fromEntries(alternatives.map(a=>[a._id,a]));
assert.equal(bmw.models.length,51);
for(const m of bmw.models)for(const s of m.groups.flatMap(g=>g.setups))for(const v of [s,...(s.alts||[])]){
  assert(Array.isArray(v.requirements),'BMW needs structured axle requirements');
  assert(!v.extra&&!v.tireNote,'Legacy BMW conditions remain');
}
assert.equal(get('BMW','M5','E39').bore,'74.1 мм');
assert.equal(get('BMW','5 Series','E39').bore,'74.1 мм');
assert.equal(get('BMW','M5','G90 G99').bolt,'5×132');
assert.equal(byId['bmw-g07-21'].front.tire,'285/45-21');
assert.equal(byId['bmw-g07-22'].front.tire,'275/40-22');
assert.equal(byId['bmw-g07-22'].rear.tire,'315/35-22');
assert.equal(byId['bmw-g45-oem-20-staggered'].front.tire,'255/45-20');
assert.equal(byId['bmw-g45-oem-20-staggered'].rear.tire,'285/40-20');
assert.equal(byId['2:38:0:2'].drive,'compatible');
assert.equal(byId['2:38:1:2'].drive,'compatible');
assert.deepEqual(byId['2:38:0:2'].requirements,[]);
assert(byId['2:3:1:0'].requirements.some(r=>r.axis==='rear'&&r.kind==='fender'&&r.level==='required'));
assert(byId['2:4:1:1'].requirements.some(r=>r.axis==='rear'&&r.kind==='fender'));
assert.equal(altById['2:45:0:1:alt:0'].rear.et,'ET36');
assert(!altById['2:34:0:3:alt:0'],'Incorrect square tyre alternative reintroduced');
assert.equal(get('Porsche','Cayenne','9YA').bolt,'5×130');
assert.equal(get('Audi','R8','Gen 2').axleMounts.front.bore,'57.1 мм');
assert.equal(get('Chevrolet','Corvette','C8 ZR1').axleMounts.rear.bolt,'5×130');
for(const m of db.find(b=>b.make==='Porsche').models){
  if(m.mounting==='centerlock')assert.equal(m.bolt,'Centerlock');
  if(m.mountVariants)assert.deepEqual(new Set(m.mountVariants.map(v=>v.mounting)),new Set(['five_lug','centerlock']));
}
assert(guide.includes('function canMergeAxles(')&&guide.includes('function conditionsMarkup('),'Axle-aware renderer missing');
console.log(JSON.stringify({models:models.length,setups:setups.length,alternatives:alternatives.length,axles,bmwModels:bmw.models.length,bmwSetups:bmw.models.reduce((n,m)=>n+m.groups.reduce((k,g)=>k+g.setups.length,0),0),sha256:crypto.createHash('sha256').update(app).digest('hex')},null,2));
