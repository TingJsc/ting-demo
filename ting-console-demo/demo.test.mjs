import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Test business transitions through the same browser event handlers; no backend claims.
function fixture(mode='console') {
  const store=new Map(),listeners={},nodes=new Map();
  const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{},open:false,value:'',showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(s);};
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  const context={Intl,Date,URLSearchParams,JSON,Number,String,Object,Map,Set,Math,console,
    location:{search:mode==='update'?'?mode=update':'',origin:'http://demo.invalid'},
    localStorage:storage,sessionStorage:{getItem:()=>'ktv',setItem:()=>{}},
    document:{querySelector:node,addEventListener:(k,f)=>listeners[k]=f},
    window:{addEventListener:()=>{},open:()=>{}},parent:{postMessage:()=>{}},
    navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>1,clearTimeout:()=>{},
    FormData:class {constructor(f){return new Map(Object.entries(f.values));}}
  };
  vm.runInNewContext(readFileSync(new URL('index.html',import.meta.url),'utf8').split('/* business demo start */')[1].split('/* business demo end */')[0],context);
  return {
    state:()=>JSON.parse(store.get('ting-business-demo-v1')),
    click:(action,id='')=>listeners.click({target:{closest:()=>({dataset:{action,id}})},preventDefault(){}}),
    role:value=>listeners.change({target:{id:'actor',value}}),
    submit:(form,values,id='')=>listeners.submit({target:{dataset:{form,id},values},preventDefault(){}}),
    html:()=>node('#app').innerHTML,
    dialog:()=>node('#dialog').innerHTML,
    change:(game,prop,checked)=>listeners.change({target:{dataset:{game,prop},checked}}),
    error:()=>node('#form-error').textContent,
  };
}
test('30 packs price uses server-design settings and creates 300 keys only after full payment',()=>{
  const f=fixture(); f.submit('purchase',{kind:'buy',quantity:'30',unit:'pack',name:'Demo',phone:'0900000000',billing:''});
  let o=f.state().orders[0];assert.equal(o.quantity,300);assert.equal(o.total,150000000);assert.equal(f.state().keys.length,3);
  f.role('accountant');f.submit('pay',{amount:'149999999',reference:'sample'},o.id);assert.equal(f.state().orders[0].state,'waiting');
  f.submit('pay',{amount:'150000000',reference:'sample'},o.id);assert.equal(f.state().keys.length,303);
  f.submit('pay',{amount:'150000000',reference:'sample'},o.id);assert.equal(f.state().keys.length,303);
});
test('buyer cannot confirm payment',()=>{const f=fixture();f.submit('pay',{amount:'500000',reference:'sample'},'DH002');assert.equal(f.state().orders.find(o=>o.id==='DH002').state,'waiting');});
test('settings change only future orders; accountant cannot change price',()=>{
 const f=fixture();const s=f.state().settings;f.role('accountant');f.submit('settings',{...s,price:123});assert.equal(f.state().settings.price,500000);
 f.role('admin');f.submit('settings',{...s,price:600000,company:'Công ty mới'});assert.equal(f.state().orders.find(o=>o.id==='DH002').total,500000);
 f.role('ktv');f.submit('purchase',{kind:'buy',quantity:'1',unit:'single',name:'Demo',phone:'0900000000'});assert.equal(f.state().orders[0].total,600000);assert.equal(f.state().orders[0].company,'Công ty mới');
});
test('bonus capped at evidence and 30 days and approval cannot apply twice',()=>{
 const f=fixture();f.role('accountant');const old=f.state().rooms[0].until;
 f.submit('bonus-review',{decision:'approved',days:'31',reason:'sample'},'UD01');assert.equal(f.state().rooms[0].until,old);
 f.submit('bonus-review',{decision:'approved',days:'15',reason:'sample'},'UD01');const after=f.state().rooms[0].until;assert.equal(Date.parse(after)-Date.parse(old),15*86400000);
 f.submit('bonus-review',{decision:'approved',days:'15',reason:'sample'},'UD01');assert.equal(f.state().rooms[0].until,after);
});
test('renewal keeps keys and adds 12 months once',()=>{
 const f=fixture();f.submit('purchase',{kind:'renew',room:'R01',name:'Demo',phone:'0900000000'});const o=f.state().orders[0];f.role('accountant');f.submit('pay',{amount:'500000',reference:'sample'},o.id);
 assert.equal(f.state().keys.length,3);assert.equal(new Date(f.state().rooms[0].until).getUTCFullYear(),2028);
 f.submit('pay',{amount:'500000',reference:'sample'},o.id);assert.equal(new Date(f.state().rooms[0].until).getUTCFullYear(),2028);
});
test('refund separates holding, revocation and returned money',()=>{
 const f=fixture();f.submit('refund-request',{reason:'sample'},'K02');let r=f.state().refunds[0];assert.equal(f.state().keys.find(k=>k.id==='K02').state,'held');
 f.role('accountant');f.click('refund-approve',r.id);assert.equal(f.state().refunds[0].state,'refunding');assert.equal(f.state().keys.find(k=>k.id==='K02').state,'revoked');
 f.submit('refund-done',{reference:'sample',invoiceRef:'adjustment'},r.id);assert.equal(f.state().refunds[0].state,'done');
});
test('owner view hides other rooms and KTV tools',()=>{const f=fixture();f.role('owner');assert.match(f.html(),/Phòng máy Lan/);assert.doesNotMatch(f.html(),/Cyber Bình Minh|Mua key \/ pack|Quản lý game/);});
test('reporting payment cannot issue key',()=>{const f=fixture();f.role('owner');f.click('report-paid','DH002');assert.equal(f.state().orders.find(o=>o.id==='DH002').state,'review');assert.equal(f.state().keys.length,3);});
test('paid key activation persists room expiry and repeated activation never resets it',()=>{
 const f=fixture('update');f.role('accountant');f.submit('pay',{amount:'500000',reference:'sample'},'DH002');f.role('owner');const k=f.state().keys.find(k=>k.order==='DH002');
 f.submit('activate',{key:k.text});const until=f.state().rooms.find(r=>r.id==='R02').until;assert.equal(f.state().update.scenario,'paid');
 f.submit('activate',{key:k.text});assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
});
test('quick buy resumes an existing order without duplicating account/order',()=>{
 const f=fixture('update');const before=f.state().orders.length;f.submit('quick-buy',{name:'Demo',phone:'0900000000',room:'Demo'});assert.equal(f.state().orders.length,before);
});

function nativeUpdateFixture(){
 const events={},store=new Map(),nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:''});return nodes.get(id);};
 const context={Date,JSON,Number,String,Object,Intl,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{getElementById:node,querySelectorAll:()=>[node('error')]},window:{addEventListener:(n,f)=>events[n]=f},FormData:class{constructor(f){return new Map(Object.entries(f.values));}},screenState:1,renderWizard(){},renderGrid(){}};
 const html=readFileSync(new URL('../ting-update-demo/index.html',import.meta.url),'utf8');
 vm.runInNewContext(html.match(/<script id="license-demo">([\s\S]*?)<\/script>/)[1],context);
 return {context,html:()=>node('wizard-step-1').innerHTML,error:()=>node('error').textContent,state:()=>context.readLicenseDemo(),submit:(fn,values)=>context[fn]({preventDefault(){},target:{values}})};
}
test('native Update keeps compact form and creates only one pending order',()=>{
 const f=nativeUpdateFixture();assert.match(f.html(),/Nhập key/);f.context.setLicenseScenario('new');f.context.setLicensePane('buy');
 f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002',room:'Cyber Lan'});
 const d=f.state(),id=d.update.order;assert.equal(d.orders.find(o=>o.id===id).total,500000);
 f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002',room:'Cyber Lan'});assert.equal(f.state().orders.length,d.orders.length);
 f.context.reportLicensePayment();assert.equal(f.state().orders.find(o=>o.id===id).state,'review');
 f.submit('activateLicenseDemo',{key:'invalid'});assert.match(f.error(),/không hợp lệ/);assert.equal(f.context.screenState,1);
});
test('native Update activates paid key once, preserves expiry and blocks offline entry',()=>{
 const f=nativeUpdateFixture(),d=f.state();d.orders.find(o=>o.id==='DH002').state='paid';d.keys.push({id:'native-key',text:'DEMO0-PAID0-TEST0-KEY00-00001',owner:'owner',state:'unused',room:null,order:'DH002'});f.context.saveLicenseDemo(d);
 f.submit('activateLicenseDemo',{key:'DEMO0-PAID0-TEST0-KEY00-00001'});const until=f.state().rooms.find(r=>r.id==='R02').until;assert.equal(f.context.screenState,3);
 f.submit('activateLicenseDemo',{key:'DEMO0-PAID0-TEST0-KEY00-00001'});assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
 f.context.setLicenseScenario('offline');f.context.screenState=1;f.context.continueLicenseDemo();assert.equal(f.context.screenState,1);
});
