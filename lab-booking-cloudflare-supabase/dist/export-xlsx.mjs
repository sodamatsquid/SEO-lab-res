import {templateFiles,templateStyles} from './xlsx-template.mjs';
const encoder=new TextEncoder(),NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const col=i=>String.fromCharCode(65+i);
const serial=value=>Date.parse(value+'Z')/86400000+25569;
const koreanTime=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16);
function cell(value,c,r,style){
 const ref=col(c)+r;
 if(typeof value==='number')return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
 // Inline strings keep user-entered '=' and URLs as text, never Excel formulas/links.
 return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function wrappedLines(value,width){return String(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((m,ch)=>m+(ch.charCodeAt(0)>255?2:1),0)/width)),0);}
export function durationParts(start,end){const minutes=Math.round((serial(end)-serial(start))*1440);return {hours:Math.floor(minutes/60),minutes:minutes%60};}
export function orderedBookings(bookings,order='date'){
 const compare=new Intl.Collator('ko',{numeric:true}).compare;
 return [...bookings].sort((a,b)=>{
  if(order==='category'){const n=compare(a.category,b.category);if(n)return n;}
  if(order==='category'||order==='equipment'){const n=compare(a.equipmentName,b.equipmentName);if(n)return n;}
  return a.start.localeCompare(b.start)||compare(a.equipmentName,b.equipmentName)||compare(a.person,b.person);
 });
}
function sheetXML(result){
 const {filters:f,generatedAt}=result,rows=orderedBookings(result.bookings,f.order),styles=templateStyles[0],last=rows.length+8;
 const widths=[6,14,27,15,20,20,9,9,32,9,46],end='K';
 const heads=['번호','장비 종류','장비','예약자','시작 · 한국시간','종료 · 한국시간','시간 (h)','분 (min)','실험 제목 / 조건','상태','상세 메모'];
 const equipment=f.equipmentId?(rows.find(b=>b.equipmentId===f.equipmentId)?.equipmentName||'선택 장비'):'전체';
 const cancelled=rows.filter(b=>b.status==='cancelled').length,order={date:'시작 날짜순',equipment:'장비별 · 시작 날짜순',category:'종류별 · 장비별 · 시작 날짜순'}[f.order]||'시작 날짜순';
 const top=[
  [2,'연구실 장비 예약 기록',38],
  [3,`조회 기간  ${f.from} ~ ${f.to}  |  한국시간 (Asia/Seoul)`,28],
  [4,`종류: ${f.category||'전체'}  ·  장비: ${equipment}  ·  예약자: ${f.person?'“'+f.person+'” 포함':'전체'}  ·  취소: ${f.includeCancelled?'포함':'제외'}`,38],
  [5,`총 ${rows.length.toLocaleString()}건  (예약 ${rows.length-cancelled} / 취소 ${cancelled})  ·  ${order}  ·  다운로드 ${koreanTime(generatedAt).replace('T',' ')}`,28],
  [6,'선택 기간과 겹치는 예약의 전체 시간을 표시합니다. 사용 시간 = 시간(h) + 분(min) · 상세 메모는 생략 없이 저장됩니다.',28]
 ];
 let data='<row r="1" ht="9" customHeight="1"/>'+top.map(([r,value,h])=>`<row r="${r}" ht="${h}" customHeight="1">${cell(value,0,r,styles[r][0])}</row>`).join('')+'<row r="7" ht="9" customHeight="1"/>';
 data+=`<row r="8" ht="38" customHeight="1">${heads.map((v,c)=>cell(v,c,8,styles[8][c])).join('')}</row>`;
 rows.forEach((b,i)=>{
  const r=i+9,s=styles[i%2?10:9],duration=durationParts(b.start,b.end);
  const values=[i+1,b.category,b.equipmentName,b.person,serial(b.start),serial(b.end),duration.hours,duration.minutes,b.title,b.status==='cancelled'?'취소':'예약',b.memo];
  const h=Math.max(46,Math.min(300,Math.max(...[1,2,3,8,10].map(c=>wrappedLines(values[c],widths[c]-2)))*18+12));
  data+=`<row r="${r}" ht="${h}" customHeight="1">${values.map((v,c)=>{
   if(c===6||c===7){const formula=c===6?`INT(ROUND((F${r}-E${r})*1440,0)/60)`:`MOD(ROUND((F${r}-E${r})*1440,0),60)`;return `<c r="${col(c)}${r}" s="${s[c]}"><f>${formula}</f><v>${v}</v></c>`;}
   return cell(v,c,r,s[c]);
  }).join('')}</row>`;
 });
 return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetPr><tabColor rgb="FF70509D"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${end}${last}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="4" ySplit="8" topLeftCell="E9" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="28"/><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A8:${end}${last}"/><mergeCells count="5">${[2,3,4,5,6].map(r=>`<mergeCell ref="A${r}:${end}${r}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L연구실 장비 예약 · 한국시간&amp;R&amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
// ZIP STORE uses no CDN/dependency and works offline in modern mobile browsers.
export function zipFiles(files){
 const chunks=[],central=[];let offset=0,size=0;
 const header=(length,values)=>{const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);for(const [pos,value,wide]of values)wide?view.setUint32(pos,value,true):view.setUint16(pos,value,true);return bytes;};
 for(const [path,text]of Object.entries(files)){
  const name=encoder.encode(path),bytes=encoder.encode(text),crc=crc32(bytes);
  const local=header(30,[[0,0x04034b50,1],[4,20],[6,0x0800],[12,33],[14,crc,1],[18,bytes.length,1],[22,bytes.length,1],[26,name.length]]);
  const item=header(46,[[0,0x02014b50,1],[4,20],[6,20],[8,0x0800],[14,33],[16,crc,1],[20,bytes.length,1],[24,bytes.length,1],[28,name.length],[42,offset,1]]);
  chunks.push(local,name,bytes);central.push(item,name);offset+=30+name.length+bytes.length;size+=46+name.length;
 }
 const end=header(22,[[0,0x06054b50,1],[8,Object.keys(files).length],[10,Object.keys(files).length],[12,size,1],[16,offset,1]]),output=new Uint8Array(offset+size+22);let pos=0;
 for(const part of [...chunks,...central,end]){output.set(part,pos);pos+=part.length;}return output;
}
export function createBookingWorkbook(result){
 if(!Array.isArray(result.bookings)||!result.bookings.length)throw Error('내려받을 예약이 없습니다.');
 if(result.bookings.length>20000)throw Error('예약이 너무 많습니다. 기간을 나누어 주세요.');
 const files={...templateFiles};files['xl/worksheets/sheet1.xml']=sheetXML(result);
 const n=result.bookings.length+8;
 files['xl/workbook.xml']=files['xl/workbook.xml'].replace('</x:workbook>',`<x:definedNames><x:definedName name="_xlnm.Print_Area" localSheetId="0">'예약기록'!$A$1:$K$${n}</x:definedName><x:definedName name="_xlnm.Print_Titles" localSheetId="0">'예약기록'!$8:$8</x:definedName></x:definedNames><x:calcPr calcMode="auto" fullCalcOnLoad="1"/></x:workbook>`);
 return zipFiles(files);
}
