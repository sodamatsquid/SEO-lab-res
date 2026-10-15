// UI and HTTP handlers access data only through this repository.
// An online DB can replace this module while preserving the API contract.
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const {exportInput}=require('./export.cjs');
const { local, today, parseLocal, bookingInput, equipmentInput, AppError } = require('./domain.cjs');
const initialEquipment = [
  ...['H-1','H-2','H-3','L-1','L-2','L-3','L-4'].map(n => [`Muffle furnace ${n}`, '머플로']),
  ...Array.from({ length: 7 }, (_, i) => [`Tube furnace ${i+1}`, '관상로']),
  ['Hydrothermal oven', '오븐'],
  ...['XRD','GC','DRS','TGA'].map(n => [n, '분석 장비']),
  ...['EPD','RDE'].map(n => [n, '전기화학']),
  ['RF magnetron sputter', '증착 장비'],
  ...['black','new','white','MAX-350'].map(n => [`Solar simulator (${n})`, '광원']),
  ...['Won A tech','Princeton','CHI','CHI-2'].map(n => [`Potentiostat (${n})`, '전기화학']),
  ...['left','right'].map(n => [`Fume hood (${n})`, '후드'])
];
function createRepository(filename, { seed = true } = {}) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, category TEXT NOT NULL,
      sort_order INTEGER NOT NULL, active INTEGER NOT NULL CHECK(active IN(0,1)), usage_note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, equipment_id TEXT NOT NULL REFERENCES equipment(id),
      start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL CHECK(end_ms > start_ms),
      person TEXT NOT NULL, title TEXT NOT NULL, color TEXT NOT NULL, memo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','cancelled')),
      version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS booking_time ON bookings(equipment_id,status,start_ms,end_ms);
    CREATE TRIGGER IF NOT EXISTS no_overlap_insert BEFORE INSERT ON bookings
      WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM bookings b WHERE b.status='active'
        AND b.equipment_id=NEW.equipment_id AND b.start_ms<NEW.end_ms AND NEW.start_ms<b.end_ms)
      BEGIN SELECT RAISE(ABORT,'booking_overlap'); END;
    CREATE TRIGGER IF NOT EXISTS no_overlap_update BEFORE UPDATE ON bookings
      WHEN NEW.status='active' AND EXISTS(SELECT 1 FROM bookings b WHERE b.status='active' AND b.id<>NEW.id
        AND b.equipment_id=NEW.equipment_id AND b.start_ms<NEW.end_ms AND NEW.start_ms<b.end_ms)
      BEGIN SELECT RAISE(ABORT,'booking_overlap'); END;`);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); db.exec('COMMIT'); return value; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const equipmentRow = r => ({ id:r.id, name:r.name, category:r.category, sortOrder:r.sort_order, active:!!r.active, usageNote:r.usage_note });
  const bookingRow = r => ({ id:r.id, equipmentId:r.equipment_id, start:local(r.start_ms), end:local(r.end_ms),
    person:r.person, title:r.title, color:r.color, memo:r.memo, version:r.version, status:r.status });
  const equipment = () => db.prepare('SELECT * FROM equipment ORDER BY sort_order,rowid').all().map(equipmentRow);
  function bookings(date) {
    const start = parseLocal(date+'T00:00'), end = start+86400000;
    return db.prepare("SELECT * FROM bookings WHERE status='active' AND start_ms<? AND end_ms>? ORDER BY start_ms").all(end,start).map(bookingRow);
  }
  function exportBookings(input){
    const f=exportInput(input);
    const rows=db.prepare(`SELECT b.*,e.name equipment_name,e.category FROM bookings b JOIN equipment e ON e.id=b.equipment_id
      WHERE b.start_ms<? AND b.end_ms>? AND (? OR b.status='active') AND (?='' OR b.equipment_id=?)
      AND (?='' OR e.category=?) AND (?='' OR instr(lower(b.person),lower(?))>0) ORDER BY b.start_ms,e.sort_order,b.id LIMIT 20001`)
      .all(f.end,f.start,+f.includeCancelled,f.equipmentId,f.equipmentId,f.category,f.category,f.person,f.person);
    if(rows.length>20000)throw new AppError('예약이 20,000건을 넘습니다. 기간이나 장비 조건을 좁혀 주세요.');
    return {filters:{from:f.from,to:f.to,person:f.person,equipmentId:f.equipmentId,category:f.category,includeCancelled:f.includeCancelled},generatedAt:new Date().toISOString(),bookings:rows.map(r=>({...bookingRow(r),equipmentName:r.equipment_name,category:r.category,createdAt:r.created_at,updatedAt:r.updated_at}))};
  }
  function saveBooking(input, id = null) {
    const b = bookingInput(input);
    return transaction(() => {
      const existing = id ? db.prepare("SELECT * FROM bookings WHERE id=? AND status='active'").get(id) : null;
      if (id && !existing) throw new AppError('이미 취소되었거나 찾을 수 없는 예약입니다. 새로고침해 주세요.',404);
      if (existing && input.version !== existing.version) throw new AppError('다른 창에서 이 예약이 변경되었습니다. 창을 닫고 다시 열어 주세요.',409);
      const device = db.prepare('SELECT * FROM equipment WHERE id=?').get(b.equipmentId);
      if (!device) throw new AppError('장비를 선택해 주세요.');
      if (!device.active && (!existing || existing.equipment_id !== b.equipmentId)) throw new AppError('사용 중지된 장비에는 새 예약을 등록할 수 없습니다.');
      const conflict = db.prepare("SELECT * FROM bookings WHERE status='active' AND equipment_id=? AND id<>? AND start_ms<? AND end_ms>? ORDER BY start_ms LIMIT 1").get(b.equipmentId,id??'',b.end,b.start);
      if (conflict) throw new AppError(`예약 시간이 겹칩니다: ${local(conflict.start_ms).replace('T',' ')} ~ ${local(conflict.end_ms).replace('T',' ')} (${conflict.person} · ${conflict.title})`,409,{ conflict:bookingRow(conflict) });
      const now = new Date().toISOString();
      if (existing) db.prepare('UPDATE bookings SET equipment_id=?,start_ms=?,end_ms=?,person=?,title=?,color=?,memo=?,version=version+1,updated_at=? WHERE id=?').run(b.equipmentId,b.start,b.end,b.person,b.title,b.color,b.memo,now,id);
      else { id=randomUUID(); db.prepare('INSERT INTO bookings(id,equipment_id,start_ms,end_ms,person,title,color,memo,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,b.equipmentId,b.start,b.end,b.person,b.title,b.color,b.memo,now,now); }
      return bookingRow(db.prepare('SELECT * FROM bookings WHERE id=?').get(id));
    });
  }
  function cancelBooking(id,version) {
    return transaction(() => {
      const existing=db.prepare("SELECT * FROM bookings WHERE id=? AND status='active'").get(id);
      if (!existing) throw new AppError('이미 취소되었거나 찾을 수 없는 예약입니다.',404);
      if (version !== existing.version) throw new AppError('예약이 변경되었습니다. 창을 닫고 다시 확인한 뒤 취소해 주세요.',409);
      db.prepare("UPDATE bookings SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(new Date().toISOString(),id);
      return { cancelled:true };
    });
  }
  function saveEquipment(input,id=null) {
    const e=equipmentInput(input);
    return transaction(() => {
      if(id&&!db.prepare('SELECT id FROM equipment WHERE id=?').get(id)) throw new AppError('장비를 찾을 수 없습니다.',404);
      if(db.prepare('SELECT id FROM equipment WHERE name=? COLLATE NOCASE AND id<>?').get(e.name,id??'')) throw new AppError('같은 이름의 장비가 있습니다. 구별할 수 있는 이름을 입력해 주세요.');
      if(id) db.prepare('UPDATE equipment SET name=?,category=?,sort_order=?,active=?,usage_note=? WHERE id=?').run(e.name,e.category,e.sortOrder,+e.active,e.usageNote,id);
      else {id=randomUUID();db.prepare('INSERT INTO equipment VALUES(?,?,?,?,?,?)').run(id,e.name,e.category,e.sortOrder,+e.active,e.usageNote);}
      return equipmentRow(db.prepare('SELECT * FROM equipment WHERE id=?').get(id));
    });
  }
  function reorderEquipment(ids) {
    return transaction(() => {
      const all=equipment().map(x=>x.id);
      if(!Array.isArray(ids)||ids.length!==all.length||new Set(ids).size!==all.length||ids.some(id=>!all.includes(id))) throw new AppError('장비 목록이 변경되었습니다. 다시 열어 주세요.',409);
      const stmt=db.prepare('UPDATE equipment SET sort_order=? WHERE id=?');ids.forEach((id,i)=>stmt.run(i+1,id));
      return equipment();
    });
  }
  if(seed&&!db.prepare("SELECT value FROM metadata WHERE key='initialized'").get()) {
    transaction(() => {const stmt=db.prepare('INSERT INTO equipment VALUES(?,?,?,?,?,?)');initialEquipment.forEach(([n,c],i)=>stmt.run('eq-'+(i+1),n,c,i+1,1,''));db.prepare('INSERT INTO metadata VALUES(?,?)').run('initialized','1');});
    const date=today(), tomorrow=local(parseLocal(date+'T00:00')+86400000).slice(0,10);
    const demos=[['eq-2','09:00',date,'12:00','가상 연구원 가','예시 · 산화물 열처리','#cfb8ed'],['eq-8','20:00',tomorrow,'06:00','가상 연구원 나','예시 · 밤샘 질화','#b6d9ef'],['eq-16','14:00',date,'15:30','가상 연구원 다','예시 · 분말 분석','#f1c2d8']];
    demos.forEach(([equipmentId,start,edate,end,person,title,color])=>saveBooking({equipmentId,start:date+'T'+start,end:edate+'T'+end,person,title,color,memo:'실제 예약이 아닌 가상 예시입니다. 자유롭게 수정하거나 취소해도 됩니다.'}));
  }
  return { equipment,bookings,exportBookings,saveBooking,cancelBooking,saveEquipment,reorderEquipment,close:()=>db.close() };
}
module.exports={createRepository,initialEquipment};
