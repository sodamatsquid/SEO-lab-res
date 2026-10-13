const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createApp}=require('../server.cjs');
const {DatabaseSync}=require('node:sqlite');
const {parseLocal}=require('../lib/domain.cjs');

test('한국시간, 직접 분 입력, 날짜별 막대 경계',async()=>{
  const {dateTime,clipBooking,shiftDay,textColor}=await import('../dist/core.mjs');
  assert.equal(dateTime('2050-01-01','0820'),'2050-01-01T08:20');
  assert.equal(dateTime('2050-01-01','24:00'),'2050-01-02T00:00');
  assert.equal(shiftDay('2050-01-01',-1),'2049-12-31');
  for(const time of ['24:30','09:99','-1:00','abc'])assert.throws(()=>dateTime('2050-01-01',time));
  assert.throws(()=>parseLocal('2050-02-30T12:00'));
  assert.equal(parseLocal('2050-01-01T09:00'),Date.parse('2050-01-01T00:00:00Z'));
  const b={start:'2050-01-01T23:30',end:'2050-01-02T00:30'};
  assert.deepEqual(clipBooking(b,'2050-01-01'),{start:1410,end:1440,before:false,after:true});
  assert.deepEqual(clipBooking(b,'2050-01-02'),{start:0,end:30,before:true,after:false});
  assert.equal(clipBooking(b,'2050-01-03'),null);
  assert.equal(clipBooking({start:b.start,end:'2050-01-02T00:00'},'2050-01-02'),null);
  assert.equal(textColor('#ffffff'),'#17121d');assert.equal(textColor('#000000'),'#ffffff');
});

test('HTTP와 SQLite: 예약 전 과정, 장비 관리, 재시작, 동시 충돌',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-booking-test-')),dbPath=path.join(dir,'test.sqlite');let server,base;
  async function start(){server=createApp({dbPath});server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;}
  async function stop(){const done=once(server,'close');server.close();server.closeIdleConnections();await done;}
  async function call(route,method='GET',data,headers={}){const r=await fetch(base+'/api'+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()};}
  const input={equipmentId:'eq-1',start:'2050-01-01T09:00',end:'2050-01-01T10:00',person:'가상 검증자',title:'검증용 열처리',color:'#cfb8ed',memo:'세부 메모\n두 번째 줄'};
  try{
    await start();let a,b,overnight;
    await t.test('32대와 가상 예약만 초기 생성',async()=>{const r=await call('/state');assert.equal(r.data.equipment.length,32);assert.equal(new Set(r.data.equipment.map(e=>e.name)).size,32);assert.equal(r.data.bookings.length,3);assert.ok(r.data.bookings.every(b=>b.person.startsWith('가상')));});
    await t.test('일반 예약 등록과 조회',async()=>{const r=await call('/bookings','POST',input);assert.equal(r.status,201);a=r.data;assert.equal(a.memo,input.memo);assert.equal((await call('/state?date=2050-01-01')).data.bookings.length,1);});
    await t.test('중복 거절과 충돌 시간 안내',async()=>{const r=await call('/bookings','POST',{...input,start:'2050-01-01T09:30'});assert.equal(r.status,409);assert.match(r.data.error,/2050-01-01 09:00 ~ 2050-01-01 10:00/);assert.equal(r.data.conflict.id,a.id);});
    await t.test('맞닿은 시간 및 다른 장비 허용',async()=>{const r=await call('/bookings','POST',{...input,start:input.end,end:'2050-01-01T11:00'});assert.equal(r.status,201);b=r.data;assert.equal((await call('/bookings','POST',{...input,equipmentId:'eq-2'})).status,201);});
    await t.test('자정과 여러 날 예약, 종료 경계 조회',async()=>{const r=await call('/bookings','POST',{...input,start:'2050-01-02T23:30',end:'2050-01-04T00:30'});assert.equal(r.status,201);overnight=r.data;for(const d of ['02','03','04'])assert.ok((await call('/state?date=2050-01-'+d)).data.bookings.some(x=>x.id===overnight.id));assert.equal((await call('/state?date=2050-01-05')).data.bookings.length,0);});
    await t.test('필수 항목, 역전 시간, 잘못된 날짜·색상 검증',async()=>{for(const change of [{person:''},{equipmentId:''},{end:input.start},{end:'2050-01-01T08:00'},{start:'2050-02-30T08:00'},{color:'bad'}])assert.equal((await call('/bookings','POST',{...input,...change})).status,400);});
    await t.test('제목 없이 예약 및 입력 이력 추천',async()=>{const r=await call('/bookings','POST',{...input,equipmentId:'eq-3',title:'',person:'추천 검증자'});assert.equal(r.status,201);assert.equal(r.data.title,'');const s=(await call('/state')).data.suggestions;assert.ok(s.people.includes('추천 검증자'));assert.ok(s.titles.includes(input.title));assert.ok(!s.titles.includes(''));});
    await t.test('수정 중 충돌 거절, 분 단위 수정과 색상 저장, 오래된 수정 거절',async()=>{assert.equal((await call('/bookings/'+a.id,'PUT',{...a,end:'2050-01-01T10:30'})).status,409);const r=await call('/bookings/'+a.id,'PUT',{...a,start:'2050-01-01T08:20',title:'수정한 실험',color:'#75428e'});assert.equal(r.status,200);assert.equal(r.data.start,'2050-01-01T08:20');assert.equal(r.data.color,'#75428e');assert.equal((await call('/bookings/'+a.id,'PUT',a)).status,409);a=r.data;});
    await t.test('취소 및 취소 시간대 재사용',async()=>{assert.equal((await call('/bookings/'+b.id,'DELETE',{version:b.version})).status,200);assert.ok(!(await call('/state?date=2050-01-01')).data.bookings.some(x=>x.id===b.id));assert.equal((await call('/bookings','POST',{...input,start:b.start,end:b.end})).status,201);});
    await t.test('장비 추가·이름·종류·안내·순서·사용 여부 변경',async()=>{const r=await call('/equipment','POST',{name:'검증용 장비',category:'기타',sortOrder:33,active:true,usageNote:''});assert.equal(r.status,201);const e=r.data;const edited=await call('/equipment/'+e.id,'PUT',{...e,name:'검증용 장비 수정',usageNote:'참고 안내',active:false});assert.equal(edited.status,200);assert.equal((await call('/bookings','POST',{...input,equipmentId:e.id})).status,400);const list=(await call('/state')).data.equipment,ids=list.map(x=>x.id).reverse();assert.equal((await call('/equipment/reorder','POST',{ids})).status,200);assert.equal((await call('/state')).data.equipment[0].id,e.id);assert.equal((await call('/equipment','POST',{...e})).status,201);assert.equal((await call('/equipment','POST',{...e})).status,400);});
    await t.test('동시 동일 시간 요청 한 건만 성공',async()=>{const data={...input,start:'2050-02-01T09:00',end:'2050-02-01T11:00'};const results=await Promise.all([call('/bookings','POST',data),call('/bookings','POST',data)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);});
    await t.test('다른 사이트 요청 차단',async()=>{assert.equal((await call('/bookings','POST',input,{Origin:'https://example.com'})).status,403);});
    await t.test('서버 종료 후 같은 DB로 재실행해도 데이터 유지',async()=>{await stop();await start();const list=(await call('/state?date=2050-01-01')).data.bookings;assert.equal(list.find(x=>x.id===a.id).title,'수정한 실험');assert.equal(list.find(x=>x.id===a.id).memo,input.memo);assert.equal(list.find(x=>x.id===a.id).color,'#75428e');assert.equal((await call('/state')).data.bookings.length,3);assert.equal((await call('/state')).data.equipment[0].name,'검증용 장비 수정');});
    await t.test('DB 직접 삽입에도 중복 방지',async()=>{const db=new DatabaseSync(dbPath);try{assert.throws(()=>db.prepare("INSERT INTO bookings SELECT 'duplicate',equipment_id,start_ms,end_ms,person,title,color,memo,status,version,created_at,updated_at FROM bookings WHERE id=?").run(a.id),/booking_overlap/);}finally{db.close();}});
  }finally{if(server?.listening)await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
