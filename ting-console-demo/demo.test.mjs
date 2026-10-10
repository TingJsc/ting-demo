import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Test business transitions through the same browser event handlers; no backend claims.
function fixture(mode='console') {
  const store=new Map(),session=new Map([['ting-demo-actor','ktv']]),listeners={},nodes=new Map(),classes=new Set();
  const node=s=>{if(!nodes.has(s))nodes.set(s,{innerHTML:'',textContent:'',style:{},open:false,value:'',showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(s);};
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)};
  const context={Intl,Date,URLSearchParams,JSON,Number,String,Object,Map,Set,Math,console,
    location:{search:mode==='update'?'?mode=update':'',origin:'http://demo.invalid'},
    localStorage:storage,sessionStorage,
    document:{querySelector:node,addEventListener:(k,f)=>listeners[k]=f,body:{classList:{toggle:(name,force)=>{if(force===undefined)force=!classes.has(name);if(force)classes.add(name);else classes.delete(name);return force;},contains:name=>classes.has(name)}}},
    window:{addEventListener:()=>{},open:()=>{}},parent:{postMessage:()=>{}},
    navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>1,clearTimeout:()=>{},
    FormData:class {constructor(f){return new Map(Object.entries(f.values));}}
  };
  vm.runInNewContext(readFileSync(new URL('index.html',import.meta.url),'utf8').split('/* business demo start */')[1].split('/* business demo end */')[0],context);
  return {
    state:()=>JSON.parse(store.get('ting-business-demo-v1')),
    click:(action,id='')=>listeners.click({target:{closest:()=>({dataset:{action,id}})},preventDefault(){}}),
    role:value=>listeners.change({target:{id:'actor',value}}),
    scenario:value=>listeners.change({target:{id:'scenario',value}}),
    submit:(form,values,id='')=>listeners.submit({target:{dataset:{form,id},values},preventDefault(){}}),
    html:()=>node('#app').innerHTML,
    dialog:()=>node('#dialog').innerHTML,
    change:(game,prop,checked)=>listeners.change({target:{dataset:{game,prop},checked}}),
    error:()=>node('#form-error').textContent,
    theme:()=>store.get('theme'),isLight:()=>classes.has('light'),session:()=>new Map(session),
    setStore:(fn)=>{const d=JSON.parse(store.get('ting-business-demo-v1'));fn(d);store.set('ting-business-demo-v1',JSON.stringify(d));vm.runInNewContext(readFileSync(new URL('index.html',import.meta.url),'utf8').split('/* business demo start */')[1].split('/* business demo end */')[0],context);},
    clearUpdateOrder:()=>{const d=JSON.parse(store.get('ting-business-demo-v1'));d.update.order=null;store.set('ting-business-demo-v1',JSON.stringify(d));vm.runInNewContext(readFileSync(new URL('index.html',import.meta.url),'utf8').split('/* business demo start */')[1].split('/* business demo end */')[0],context);},
    openConsole:()=>{context.location.search='';vm.runInNewContext(readFileSync(new URL('index.html',import.meta.url),'utf8').split('/* business demo start */')[1].split('/* business demo end */')[0],context);},
    reload:()=>vm.runInNewContext(readFileSync(new URL('index.html',import.meta.url),'utf8').split('/* business demo start */')[1].split('/* business demo end */')[0],context),
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
 f.role('accountant');f.submit('settings',{...s,company:'Công ty mới'});f.role('ktv');f.submit('purchase',{kind:'buy',quantity:'1',unit:'single',name:'Demo',phone:'0900000000'});assert.equal(f.state().orders[0].total,600000);assert.equal(f.state().orders[0].company,'Công ty mới');
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
test('owner has no invoice menu or KTV invoice, but can see invoice for a direct purchase',()=>{
 const f=fixture();f.role('owner');assert.doesNotMatch(f.html(),/data-id="invoices"/);
 f.click('page','invoices');assert.match(f.html(),/Phòng máy của tôi/);
 f.click('page','profile');assert.doesNotMatch(f.html(),/Thông tin xuất hóa đơn|cần mua hàng hoặc lập hóa đơn/);
 f.role('accountant');f.submit('pay',{amount:'500000',reference:'sample'},'DH002');
 f.role('owner');f.click('page','orders');assert.doesNotMatch(f.html(),/DH001/);
 f.click('order','DH002');assert.match(f.dialog(),/Hóa đơn của đơn tự mua/);
 f.click('invoice','DH001');assert.doesNotMatch(f.dialog(),/Hóa đơn · DH001/);
 f.role('ktv');f.click('page','invoices');assert.match(f.html(),/Hóa đơn/);
});
test('reporting payment cannot issue key',()=>{const f=fixture();f.role('owner');f.click('report-paid','DH002');assert.equal(f.state().orders.find(o=>o.id==='DH002').state,'review');assert.equal(f.state().keys.length,3);});
test('paid key activation persists room expiry and repeated activation never resets it',()=>{
 const f=fixture('update');f.role('accountant');f.submit('pay',{amount:'500000',reference:'sample'},'DH002');f.role('owner');const k=f.state().keys.find(k=>k.order==='DH002');
 f.submit('activate',{key:k.text});const until=f.state().rooms.find(r=>r.id==='R02').until;assert.equal(f.state().update.scenario,'paid');
 f.submit('activate',{key:k.text});assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
});
test('Console Update gives a new install thirty trial days and keeps paid license on reconnect',()=>{
 const f=fixture('update');f.scenario('new');assert.equal(Date.parse(f.state().rooms.find(r=>r.id==='R02').until)-Date.parse(f.state().rooms.find(r=>r.id==='R02').trialStartedAt),30*86400000);assert.match(f.html(),/Đã tự động bật dùng thử/);assert.match(f.html(),/Vào màn hình cập nhật game/);
 f.scenario('expired');assert.equal(f.state().rooms.find(r=>r.id==='R02').type,'expired');assert.doesNotMatch(f.html(),/Vào màn hình cập nhật game/);
 f.scenario('paid');const until=f.state().rooms.find(r=>r.id==='R02').until;f.scenario('offline');f.click('reconnect');assert.equal(f.state().update.scenario,'paid');assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
 f.scenario('trial');assert.equal(f.state().rooms.find(r=>r.id==='R02').type,'paid');assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
 f.scenario('paid-expired');assert.equal(f.state().rooms.find(r=>r.id==='R02').type,'paid');assert.doesNotMatch(f.html(),/Vào màn hình cập nhật game/);
});
test('quick buy resumes an existing order without duplicating account/order',()=>{
 const f=fixture('update');const before=f.state();f.submit('quick-buy',{name:'Demo',phone:'0900000000'});const after=f.state();assert.equal(after.orders.length,before.orders.length);assert.deepEqual(after.profiles,before.profiles);
});
test('Console embedded Update creates only an order, not a profile or room edit',()=>{
 const f=fixture('update');f.clearUpdateOrder();const before=f.state();f.submit('quick-buy',{name:'Khách lẻ',phone:'0900000003'});const after=f.state(),o=after.orders.find(o=>o.id===after.update.order);
 assert.equal(after.orders.length,before.orders.length+1);assert.equal(o.owner,'guest');assert.equal(o.source,'update');assert.equal(o.contactName,'Khách lẻ');assert.equal(o.contactPhone,'0900000003');assert.deepEqual(after.profiles,before.profiles);assert.deepEqual(after.rooms,before.rooms);
 assert.match(f.dialog(),/0900000003/);
 f.openConsole();f.role('owner');f.click('page','orders');assert.doesNotMatch(f.html(),new RegExp(o.id));
});
test('retail buyer can submit old license with order; accountant grants days only after payment',()=>{
 const f=fixture('update');f.clearUpdateOrder();
 f.submit('quick-buy',{name:'Lan',phone:'0900000002',oldSoftware:'Phần mềm cũ',oldLicenseUntil:'2026-10-22',oldLicenseProof:{name:'proof.png',type:'image/png',size:1024}});
 const order=f.state().orders.find(o=>o.id===f.state().update.order);assert.equal(order.oldOffer.software,'Phần mềm cũ');assert.equal(order.oldOffer.evidence,'proof.png');assert.equal(f.state().bonuses.length,1);
 f.role('accountant');f.submit('pay',{amount:'500000',reference:'sample'},order.id);
 const bonus=f.state().bonuses.find(b=>b.order===order.id);assert.equal(bonus.state,'pending');assert.ok(bonus.days>0&&bonus.days<=30);
 f.submit('bonus-review',{decision:'approved',days:'10',reason:'Đã kiểm tra'},bonus.id);assert.equal(f.state().bonuses.find(b=>b.id===bonus.id).applied,false);
 f.role('owner');const key=f.state().keys.find(k=>k.order===order.id);f.submit('activate',{key:key.text});
 const active=f.state();assert.equal(active.bonuses.find(b=>b.id===bonus.id).applied,true);assert.equal(Date.parse(active.rooms.find(r=>r.id==='R02').until)-Date.parse('2027-10-07T10:00:00+07:00'),10*86400000);
 f.submit('activate',{key:key.text});assert.equal(f.state().rooms.find(r=>r.id==='R02').until,active.rooms.find(r=>r.id==='R02').until);
});
test('owner Console purchase keeps optional old license on the correct room',()=>{
 const f=fixture();f.role('owner');f.submit('purchase',{kind:'buy',room:'R01',unit:'single',quantity:'1',name:'Lan',phone:'0900000002'});assert.equal(f.state().orders.length,2);
 f.submit('purchase',{kind:'buy',room:'R02',unit:'single',quantity:'1',name:'Lan',phone:'0900000002',oldSoftware:'Phần mềm cũ',oldLicenseUntil:'2026-10-22',oldLicenseProof:{name:'proof.png',type:'image/png',size:1024}});
 const o=f.state().orders[0];assert.equal(o.owner,'owner');assert.equal(o.room,'R02');assert.equal(o.oldOffer.software,'Phần mềm cũ');
 f.role('accountant');f.submit('pay',{amount:'500000',reference:'sample'},o.id);assert.equal(f.state().bonuses.find(b=>b.order===o.id).state,'pending');
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
 const before=f.state();assert.doesNotMatch(f.html(),/name="room"/);f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002'});
 const d=f.state(),id=d.update.order,o=d.orders.find(o=>o.id===id);assert.equal(o.total,500000);assert.equal(o.owner,'guest');assert.equal(o.source,'update');assert.equal(o.contactName,'Lan');assert.equal(o.contactPhone,'0900000002');assert.deepEqual(d.profiles,before.profiles);assert.equal(d.rooms.find(r=>r.id==='R02').name,before.rooms.find(r=>r.id==='R02').name);
 f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002'});assert.equal(f.state().orders.length,d.orders.length);
 f.context.reportLicensePayment();assert.equal(f.state().orders.find(o=>o.id===id).state,'review');
 f.submit('activateLicenseDemo',{key:'invalid'});assert.match(f.error(),/không hợp lệ/);assert.equal(f.context.screenState,1);
});
test('native Update stores optional old license and applies approved days on first activation',()=>{
  const f=nativeUpdateFixture();f.context.setLicenseScenario('new');f.context.setLicensePane('buy');assert.match(f.html(),/Đang chuyển từ phần mềm khác/);assert.match(f.html(),/type="file"/);assert.doesNotMatch(f.html(),/Link ảnh/);
 f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002',oldSoftware:'Phần mềm cũ',oldLicenseUntil:'2026-10-22'});assert.match(f.error(),/Điền đủ/);
  f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002',oldSoftware:'Phần mềm cũ',oldLicenseUntil:'2026-10-22',oldLicenseProof:{name:'bad.exe',type:'application/octet-stream',size:1024}});assert.match(f.error(),/JPG, PNG, WebP hoặc PDF/);
 f.submit('buyLicenseDemo',{name:'Lan',phone:'0900000002',oldSoftware:'Phần mềm cũ',oldLicenseUntil:'2026-10-22',oldLicenseProof:{name:'proof.png',type:'image/png',size:1024}});
 const d=f.state(),o=d.orders.find(o=>o.id===d.update.order);assert.equal(o.oldOffer.software,'Phần mềm cũ');assert.equal(o.oldOffer.evidence,'proof.png');o.state='paid';d.keys.push({id:'K-new',text:'GUEST-AAAAA-BBBBB-CCCCC-DDDDD',owner:'guest',state:'unused',room:null,order:o.id});d.bonuses.push({id:'UD-new',order:o.id,room:'R02',state:'approved',days:10,applied:false});f.context.saveLicenseDemo(d);
 f.submit('activateLicenseDemo',{key:'GUEST-AAAAA-BBBBB-CCCCC-DDDDD'});const active=f.state();assert.equal(active.bonuses.find(b=>b.id==='UD-new').applied,true);assert.equal(Date.parse(active.rooms.find(r=>r.id==='R02').until)-Date.parse('2027-10-07T10:00:00+07:00'),10*86400000);
});
test('native Update cannot self-purchase for a KTV-managed room',()=>{
 const f=nativeUpdateFixture(),d=f.state();d.update.room='R01';d.update.order=null;f.context.saveLicenseDemo(d);f.context.setLicensePane('buy');assert.match(f.html(),/do KTV quản lý/);
 f.submit('buyLicenseDemo',{name:'Khách',phone:'0900000002'});assert.equal(f.state().orders.length,d.orders.length);assert.match(f.error(),/liên hệ KTV/);
});
test('native Update accepts only the paid guest key for its current order',()=>{
 const f=nativeUpdateFixture();f.context.setLicenseScenario('new');f.submit('buyLicenseDemo',{name:'Khách',phone:'0900000003'});const d=f.state(),id=d.update.order;d.orders.find(o=>o.id===id).state='paid';d.keys.push({id:'guest-key',text:'GUEST-AAAAA-BBBBB-CCCCC-DDDDD',owner:'guest',state:'unused',room:null,order:id});d.keys.push({id:'other-key',text:'OTHER-AAAAA-BBBBB-CCCCC-DDDDD',owner:'guest',state:'unused',room:null,order:'another-order'});f.context.saveLicenseDemo(d);
 f.submit('activateLicenseDemo',{key:'OTHER-AAAAA-BBBBB-CCCCC-DDDDD'});assert.equal(f.context.screenState,1);
 f.submit('activateLicenseDemo',{key:'GUEST-AAAAA-BBBBB-CCCCC-DDDDD'});assert.equal(f.context.screenState,3);assert.equal(f.state().keys.find(k=>k.id==='guest-key').room,'R02');
});
test('native Update activates paid key once, preserves expiry and blocks offline entry',()=>{
 const f=nativeUpdateFixture(),d=f.state();d.orders.find(o=>o.id==='DH002').state='paid';d.keys.push({id:'native-key',text:'DEMO0-PAID0-TEST0-KEY00-00001',owner:'owner',state:'unused',room:null,order:'DH002'});f.context.saveLicenseDemo(d);
 f.submit('activateLicenseDemo',{key:'DEMO0-PAID0-TEST0-KEY00-00001'});const until=f.state().rooms.find(r=>r.id==='R02').until;assert.equal(f.context.screenState,3);
 f.submit('activateLicenseDemo',{key:'DEMO0-PAID0-TEST0-KEY00-00001'});assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
 f.context.setLicenseScenario('offline');f.context.screenState=1;f.context.continueLicenseDemo();assert.equal(f.context.screenState,1);
});
test('native Update preserves saved trial expiry and gives thirty days on first activation',()=>{
 const f=nativeUpdateFixture(),d=f.state();d.rooms.find(r=>r.id==='R02').until='2026-10-08T00:00:00+07:00';f.context.saveLicenseDemo(d);
 assert.equal(f.state().rooms.find(r=>r.id==='R02').until,'2026-10-08T00:00:00+07:00');
 f.context.setLicenseScenario('new');assert.match(f.html(),/Dùng thử 30 ngày từ lần kích hoạt đầu/);assert.match(f.html(),/Tiếp tục vào Ting Update/);
 f.context.continueLicenseDemo();assert.equal(f.context.screenState,3);
});
test('native Update reconnect keeps paid license and cannot change it back to trial',()=>{
 const f=nativeUpdateFixture();f.context.setLicenseScenario('paid');const until=f.state().rooms.find(r=>r.id==='R02').until;
 f.context.setLicenseScenario('offline');f.context.reconnectLicenseDemo();assert.equal(f.state().update.scenario,'paid');
 f.context.setLicenseScenario('trial');assert.equal(f.state().rooms.find(r=>r.id==='R02').type,'paid');assert.equal(f.state().rooms.find(r=>r.id==='R02').until,until);
 f.context.setLicenseScenario('paid-expired');assert.equal(f.state().rooms.find(r=>r.id==='R02').type,'paid');assert.doesNotMatch(f.html(),/Tiếp tục vào Ting Update/);
});

test('unified demo removes legacy trial controls and uses existing Ting logo',()=>{
 const html=readFileSync(new URL('index.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/BASELINE_START|session-demo|Phiên \/ lỗi|trial24|Thêm 7 ngày/);
 assert.match(html,/logo-admin\.svg/);
 const f=fixture();f.role('admin');f.click('page','licenses');assert.match(f.html(),/Dùng thử 30 ngày/);assert.doesNotMatch(f.html(),/Dùng thử đến 15\/11\/2026/);
 const count=f.state().orders.length;f.submit('purchase',{kind:'renew',room:'R02',name:'Lan',phone:'0900000002'});assert.equal(f.state().orders.length,count);
});
test('existing game auto-download and marketing flags remain editable only by admin',()=>{
 const f=fixture();f.role('admin');f.click('page','games');assert.match(f.html(),/data-prop="forceDownload"/);
 f.change('G1','forceDownload',true);assert.equal(f.state().games.find(g=>g.id==='G1').forceDownload,true);
 f.role('ktv');f.change('G1','forceDownload',false);assert.equal(f.state().games.find(g=>g.id==='G1').forceDownload,true);
});
test('room assignment rejects duplicate and out-of-region technician; transfer preserves buyer',()=>{
 const f=fixture();f.role('admin');const r=f.state().rooms[0];
 f.submit('room-add',{ting:r.ting,name:'Duplicate',region:'HCM',tech:'ktv'});assert.equal(f.state().rooms.length,3);
 f.submit('room-add',{ting:'TING-MMMM-NNNN-OOOO-PPPP',name:'New',region:'OTHER',tech:'ktv'});assert.equal(f.state().rooms.length,3);
 f.submit('assign',{tech:'ktv2',reason:'test'},r.id);assert.equal(f.state().rooms[0].tech,'ktv2');assert.equal(f.state().rooms[0].owner,r.owner);
});

test('accountant has finance workspace without technical room, key or game controls',()=>{
 const f=fixture();f.role('accountant');assert.match(f.html(),/Công việc kế toán/);assert.doesNotMatch(f.html(),/data-id="rooms"|data-id="keys"|data-id="games"|data-id="accounts"/);
 f.click('page','rooms');assert.match(f.html(),/Công việc kế toán/);
 f.submit('room-revoke',{reason:'test'},'R01');assert.notEqual(f.state().rooms[0].revoked,true);
});
test('self-registration cannot create admin or accountant and owner cannot buy packs',()=>{
 const f=fixture();const before=f.state();f.submit('register',{role:'admin',name:'bad'});assert.deepEqual(f.state(),before);
 f.submit('register',{role:'accountant',name:'bad'});assert.deepEqual(f.state(),before);
 f.role('owner');f.submit('purchase',{kind:'buy',quantity:'1',unit:'pack',name:'Lan',phone:'0900000002'});assert.equal(f.state().orders.length,before.orders.length);
});
test('room assignment does not transfer buyer orders or keys',()=>{
 const f=fixture();f.role('admin');f.submit('assign',{tech:'ktv2',reason:'test'},'R01');f.role('ktv');
 f.click('page','rooms');assert.doesNotMatch(f.html(),/Cyber Bình Minh/);
 f.click('page','keys');assert.match(f.html(),/DEMO1-AAAAA-BBBBB-CCCCC-DDDDD/);
});

test('add and edit dialogs follow Update header/body/footer with cancel and specific action',()=>{
 const f=fixture();f.role('admin');f.click('account-add');assert.match(f.dialog(),/modal-header/);assert.match(f.dialog(),/modal-body/);assert.match(f.dialog(),/modal-footer/);assert.match(f.dialog(),/type="button" data-action="close">Hủy/);assert.match(f.dialog(),/type="submit" class="primary">Thêm KTV/);
 const before=f.state().accounts.length;f.click('close');assert.equal(f.state().accounts.length,before);
 f.click('game','G1');assert.match(f.dialog(),/>Lưu thay đổi<\/button>/);assert.doesNotMatch(f.dialog(),/Lưu \/ xác nhận/);
});

test('Update activation uses existing desktop input/select classes, including purchase fields',()=>{
 const f=nativeUpdateFixture();assert.match(f.html(),/class="form-input" name="key"/);assert.match(f.html(),/class="adv-search-select"/);assert.doesNotMatch(f.html(),/settings-input|settings-select/);
 f.context.setLicenseScenario('new');f.context.setLicensePane('buy');
 for(const name of ['name','phone'])assert.match(f.html(),new RegExp('class="form-input" name="'+name+'"'));
 assert.doesNotMatch(f.html(),/name="room"/);
});

test('admin navigation and dashboard contain management, not finance work',()=>{
 const f=fixture();f.role('admin');
 for(const p of ['orders','bonuses','invoices','refunds','keys'])assert.doesNotMatch(f.html(),new RegExp('data-id="'+p+'"'));
 for(const p of ['rooms','licenses','accounts','games','tracker','settings'])assert.match(f.html(),new RegExp('data-id="'+p+'"'));
 assert.doesNotMatch(f.html(),/data-id="menu"/);
 f.click('page','orders');assert.match(f.html(),/Tổng quan hệ thống/);
});
test('admin cannot approve money, bonuses, invoices or refund via direct handlers',()=>{
 const f=fixture();f.submit('refund-request',{reason:'test'},'K02');const refund=f.state().refunds[0];f.role('admin');const before=f.state();
 f.submit('pay',{amount:'500000',reference:'test'},'DH002');f.submit('bonus-review',{decision:'approved',days:'15'},'UD01');f.click('invoice-issue','DH001');f.click('refund-approve',refund.id);f.submit('refund-done',{reference:'test',invoiceRef:'test'},refund.id);
 assert.deepEqual(f.state(),before);
 const s=f.state().settings;f.submit('settings',{...s,price:600000,company:'Wrong'});assert.equal(f.state().settings.company,s.company);assert.equal(f.state().settings.price,600000);
});

test('staff cannot impersonate customer actions on waiting orders or quick purchases',()=>{
 for(const role of ['admin','accountant']){
  const f=fixture();f.role(role);const before=f.state();
  f.click('report-paid','DH002');f.click('cancel-order','DH002');
  f.submit('quick-buy',{name:'Wrong',phone:'0900000000',room:'Wrong'});
  f.submit('refund-request',{reason:'Wrong'},'K02');
  assert.deepEqual(f.state(),before);
 }
});
test('customers cannot read or mutate another buyer order',()=>{
 for(const [role,other] of [['ktv','DH002'],['owner','DH001']]){
  const f=fixture();f.role(role);const before=f.state();
  f.click('order',other);assert.doesNotMatch(f.dialog(),new RegExp('Đơn '+other));
  f.click('report-paid',other);f.click('cancel-order',other);
  f.submit('pay',{amount:'500000',reference:'Wrong'},other);
  assert.deepEqual(f.state(),before);
 }
});
test('unknown roles and console activation cannot bypass account boundaries',()=>{
 const f=fixture();const before=f.state();f.role('unknown');f.submit('login',{actor:'unknown'});
 f.submit('activate',{key:'invalid'});assert.deepEqual(f.state(),before);
 f.role('accountant');f.click('order','DH001');assert.doesNotMatch(f.dialog(),/data-action="copy"/);
});
test('revoked room rejects native activation and entry even with paid key',()=>{
 const f=nativeUpdateFixture(),d=f.state();d.rooms.find(r=>r.id==='R02').revoked=true;
 d.orders.find(o=>o.id==='DH002').state='paid';
 d.keys.push({id:'revoked-test',text:'REVOKED-TEST',owner:'owner',state:'unused',room:null,order:'DH002'});
 f.context.saveLicenseDemo(d);f.submit('activateLicenseDemo',{key:'REVOKED-TEST'});
 assert.equal(f.state().keys.find(k=>k.id==='revoked-test').state,'unused');
 f.context.continueLicenseDemo();assert.equal(f.context.screenState,1);
});

test('room management retains staging operational columns independently of license state',()=>{
 const f=fixture();f.role('admin');f.click('page','rooms');
 for(const title of ['Trạng thái','Dung lượng','Đồng bộ gần nhất','Peer'])assert.ok(f.html().includes(title));
 f.submit('room-revoke',{reason:'test'},'R01');f.click('page','rooms');assert.match(f.html(),/Đã thu hồi/);
});

test('marketing preview follows source QC then HOT, supports add/remove and safe image fallback',()=>{
 const f=fixture();f.role('admin');f.click('page','settings');
 assert.ok(f.html().indexOf('data-poster="G2"')<f.html().indexOf('data-poster="G1"'));
 assert.match(f.html(),/poster-fallback/);
 f.submit('menu-select',{game:'G3'},'hot');assert.equal(f.state().games.find(g=>g.id==='G3').hot,true);
 assert.match(f.html(),/data-poster="G3"/);
 f.click('menu-remove-hot','G3');assert.equal(f.state().games.find(g=>g.id==='G3').hot,false);
 f.click('menu-remove-promoted','G2');assert.equal(f.state().games.find(g=>g.id==='G2').promoted,false);
 f.click('menu-remove-hot','G1');assert.match(f.html(),/Chưa có game trong dải poster/);
});
test('all non-admin roles cannot change marketing through direct actions or submits',()=>{
 for(const role of ['ktv','owner','accountant']){
  const f=fixture();f.role(role);const before=f.state();
  f.submit('menu-select',{game:'G3'},'promoted');f.click('menu-remove-promoted','G2');
  f.click('menu-remove-hot','G1');f.submit('game',{hot:'on',adThumbnail:'https://example.invalid/a.png'},'G3');
  assert.deepEqual(f.state(),before);
 }
});
test('invalid image URL or missing game cannot partially change game configuration',()=>{
 const f=fixture();f.role('admin');const before=f.state();
 f.submit('game',{hot:'on',adThumbnail:'javascript:alert(1)'},'G3');
 assert.deepEqual(f.state(),before);f.submit('game',{hot:'on'},'missing');assert.deepEqual(f.state(),before);
});

test('theme button matches Console sidebar and survives role switch and reload',()=>{
 const f=fixture();assert.match(f.html(),/data-action="theme"/);assert.match(f.html(),/data-action="logout"/);
 assert.match(f.html(),/TING CONTROL PLANE/);assert.match(f.html(),/Làm mới/);
 f.click('theme');assert.equal(f.theme(),'light');assert.equal(f.isLight(),true);
 f.role('admin');assert.equal(f.isLight(),true);f.reload();assert.equal(f.isLight(),true);
 f.click('theme');assert.equal(f.theme(),'dark');assert.equal(f.isLight(),false);
});
test('logout hides all management screens, keeps demo data, then sample login restores correct role',()=>{
 const f=fixture();f.role('admin');const before=f.state();f.click('logout');
 assert.match(f.html(),/Đăng nhập tài khoản mẫu/);assert.doesNotMatch(f.html(),/data-id="accounts"/);
 assert.equal(f.session().get('ting-demo-signed-out'),'1');assert.equal(f.session().has('ting-demo-actor'),false);
 f.click('page','accounts');f.submit('settings',{price:900000,pack:10});
 assert.deepEqual(f.state(),before);assert.doesNotMatch(f.html(),/data-id="accounts"/);
 f.reload();assert.match(f.html(),/Đăng nhập tài khoản mẫu/);
 f.submit('login',{actor:'owner'});assert.match(f.html(),/Phòng máy của tôi/);
 assert.doesNotMatch(f.html(),/data-id="accounts"/);assert.equal(f.session().get('ting-demo-signed-out'),'0');
});
test('logged-out registration remains available only for KTV or owner',()=>{
 const f=fixture();f.click('logout');f.click('auth-register');
 assert.match(f.html(),/Kỹ thuật viên/);assert.match(f.html(),/Chủ phòng máy/);
 const before=f.state();f.submit('register',{role:'accountant',name:'Wrong'});
 assert.deepEqual(f.state(),before);assert.match(f.html(),/Chào mừng đến Ting/);
 f.click('close');assert.match(f.html(),/Đăng nhập tài khoản mẫu/);
 f.click('auth-register');
 f.click('auth-login');assert.match(f.html(),/Đăng nhập tài khoản mẫu/);
});
test('staging Settings placement and KTV account scope match the proposed roles',()=>{
 const f=fixture();f.role('admin');f.click('page','settings');
 assert.match(f.html(),/Xem trước dải poster Ting Menu/);
 assert.match(f.html(),/Giá & cấu hình license/);
 f.click('page','accounts');assert.match(f.html(),/<td>ktv2<\/td>/);
 assert.doesNotMatch(f.html(),/<td>owner<\/td>|<td>accountant<\/td>/);
 f.role('ktv');assert.match(f.html(),/data-id="settings"/);
 f.click('page','settings');assert.match(f.html(),/Xem trước dải poster Ting Menu/);
 assert.doesNotMatch(f.html(),/data-form="settings"|data-action="menu-select"/);
 f.role('accountant');f.click('page','settings');
 assert.match(f.html(),/Tên công ty bán hàng/);
 assert.doesNotMatch(f.html(),/Xem trước dải poster Ting Menu/);
});

test('KTV key pool allows activating yearly license and decrements available pool',()=>{
 const f=fixture();
 const initialPool=f.state().keyPools['ktv'];
 const initialActivated=initialPool.activated;
 f.submit('license-activate',{room:'R02',kind:'yearly'},'R02');
 const afterPool=f.state().keyPools['ktv'];
 assert.equal(afterPool.activated,initialActivated+1);
 const room=f.state().rooms.find(r=>r.id==='R02');
 assert.equal(room.type,'paid');
 assert.equal(room.settlementMonth,'2026-10');
});

test('KTV key pool rejects activation when pool has zero available keys',()=>{
 const f=fixture();
 f.setStore(d=>{d.keyPools['ktv'].activated=d.keyPools['ktv'].allocated;});
 f.submit('license-activate',{room:'R02',kind:'yearly'},'R02');
 assert.match(f.error(),/Kho key của KTV đã hết/);
});

test('Admin can allocate keys to KTV pool',()=>{
 const f=fixture();
 f.role('admin');
 const initialAllocated=f.state().keyPools['ktv'].allocated;
 f.submit('pool-allocate',{tech:'ktv',quantity:'20'});
 assert.equal(f.state().keyPools['ktv'].allocated,initialAllocated+20);
});

test('Monthly settlement calculates total activated keys and accountant can issue consolidated invoice and mark paid',()=>{
 const f=fixture();
 f.role('accountant');
 f.click('page','settlements');
 assert.match(f.html(),/Chốt Kỳ Kế Toán/);
 f.submit('settlement-invoice',{tech:'ktv',invoiceRef:'HD-202610-099'});
 const s=f.state().settlements.find(x=>x.tech==='ktv'&&x.month==='2026-10');
 assert.equal(s.state,'invoiced');
 assert.equal(s.invoiceRef,'HD-202610-099');
 f.submit('settlement-pay',{tech:'ktv',paidRef:'UNC-TEST-9988'});
 const sPaid=f.state().settlements.find(x=>x.tech==='ktv'&&x.month==='2026-10');
 assert.equal(sPaid.state,'paid');
 assert.equal(sPaid.paidRef,'UNC-TEST-9988');
});

test('Retail room activation by admin records external transfer reference and yearly license',()=>{
 const f=fixture();
 f.role('admin');
 f.submit('license-activate',{room:'R02',kind:'retail',reference:'CK-VIETCOMBANK-12345'});
 const r=f.state().rooms.find(x=>x.id==='R02');
 assert.equal(r.type,'paid');
 assert.equal(r.source,'retail');
 assert.equal(f.state().keys.some(k=>k.order==='RETAIL'&&k.room==='R02'),true);
});

test('trial preserves first activation expiry and cannot be granted to a room manually',()=>{
 const f=fixture();
 f.setStore(d=>{d.rooms.find(x=>x.id==='R02').until='2026-11-06T00:00:00+07:00';});
 assert.equal(f.state().rooms.find(x=>x.id==='R02').until,'2026-11-06T00:00:00+07:00');
 f.submit('license-activate',{room:'R01',kind:'trial'});
 const r=f.state().rooms.find(x=>x.id==='R01');
 assert.equal(r.type,'paid');
 assert.match(f.error(),/Trial tự động 30 ngày trong thời gian ưu đãi/);
});
