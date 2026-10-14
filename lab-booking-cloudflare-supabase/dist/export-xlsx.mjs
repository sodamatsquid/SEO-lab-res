import {templateFiles,templateStyles} from './xlsx-template.mjs';
const encoder=new TextEncoder(),NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const col=i=>String.fromCharCode(65+i);
const serial=value=>Date.parse(value+'Z')/86400000+25569;
const timestampSerial=value=>Date.parse(value)/86400000+25569+9/24;
const koreanTime=value=>new Date(Date.parse(value)+9*3600000).toISOString().slice(0,16);
function cell(value,c,r,style){
 const ref=col(c)+r;
 if(typeof value==='number')return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
 // Inline strings keep user-entered '=' and URLs as text, never Excel formulas/links.
 return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
const shortMemo=value=>value.length>180||value.split('\n').length>8?value.split('\n').slice(0,8).join('\n').slice(0,180)+'… (원본데이터 참고)':value;
function wrappedLines(value,width){return String(value).split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil([...line].reduce((m,ch)=>m+(ch.charCodeAt(0)>255?2:1),0)/width)),0);}
function sheetXML(result,raw){
 const {filters:f,bookings:rows,generatedAt}=result,styles=templateStyles[raw?1:0],last=rows.length+8;
 const widths=raw?[38,15,29,16,16,23,23,35,12,55,14,9,25,25]:[6,27,13,21,21,10,32,10,42],end=col(widths.length-1);
 const heads=raw?['예약 ID','장비 ID','장비명','종류','예약자','시작 · 한국시간','종료 · 한국시간','실험 제목 / 조건','색상','상세 메모','상태','버전','등록 · 한국시간','수정 · 한국시간']:['번호','장비','예약자','시작 · 한국시간','종료 · 한국시간','시간 (h)','실험 제목 / 조건','상태','상세 메모'];
 const equipment=f.equipmentId?(rows.find(b=>b.equipmentId===f.equipmentId)?.equipmentName||f.equipmentId):'전체 장비';
 const cancelled=rows.filter(b=>b.status==='cancelled').length;
 const top=[
  [2,raw?'예약 원본데이터 · 내려받은 시점의 상태':'연구실 장비 예약 기록',34],
  [3,`조회 기간  ${f.from} ~ ${f.to}  |  한국시간 (Asia/Seoul)`,24],
  [4,`장비: ${equipment}  ·  예약자: ${f.person?'“'+f.person+'” 포함':'전체'}  ·  취소 예약: ${f.includeCancelled?'포함':'제외'}`,32],
  [5,`총 ${rows.length.toLocaleString()}건  (예약 ${rows.length-cancelled} / 취소 ${cancelled})  ·  다운로드 ${koreanTime(generatedAt).replace('T',' ')}`,24],
  [6,raw?'예약 식별정보와 메모 전문입니다. 긴 메모는 셀을 선택해 확인하세요. 변경 이력·DB 구조·권한을 포함한 전체 백업은 아닙니다.':'선택 기간과 겹치는 예약의 전체 시간을 표시합니다. 긴 메모 전문과 예약 ID는 ‘원본데이터’ 시트에서 확인하세요.',32]
 ];
 let data='<row r="1" ht="9" customHeight="1"/>'+top.map(([r,value,h])=>`<row r="${r}" ht="${h}" customHeight="1">${cell(value,0,r,styles[r][0])}</row>`).join('')+'<row r="7" ht="9" customHeight="1"/>';
 data+=`<row r="8" ht="32" customHeight="1">${heads.map((v,c)=>cell(v,c,8,styles[8][c])).join('')}</row>`;
 rows.forEach((b,i)=>{
  const r=i+9,s=styles[i%2?10:9];
  const values=raw?[b.id,b.equipmentId,b.equipmentName,b.category,b.person,serial(b.start),serial(b.end),b.title,b.color,b.memo,b.status,b.version,timestampSerial(b.createdAt),timestampSerial(b.updatedAt)]:[i+1,b.equipmentName,b.person,serial(b.start),serial(b.end),Math.round((serial(b.end)-serial(b.start))*24*1e8)/1e8,b.title,b.status==='cancelled'?'취소':'예약',shortMemo(b.memo)];
  const h=raw?42:Math.max(34,Math.min(240,Math.max(...[1,2,6,8].map(c=>wrappedLines(values[c],widths[c]-2)))*16+10));
  data+=`<row r="${r}" ht="${h}" customHeight="1">${values.map((v,c)=>{
   if(!raw&&c===5)return `<c r="F${r}" s="${s[c]}"><f>(E${r}-D${r})*24</f><v>${v}</v></c>`;
   return cell(v,c,r,s[c]);
  }).join('')}</row>`;
 });
 return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}"><sheetPr><tabColor rgb="FF70509D"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${end}${last}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="2" ySplit="8" topLeftCell="C9" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="28"/><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${data}</sheetData><autoFilter ref="A8:${end}${last}"/><mergeCells count="5">${[2,3,4,5,6].map(r=>`<mergeCell ref="A${r}:${end}${r}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.35" bottom="0.35" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L연구실 장비 예약 · 한국시간&amp;R&amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
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
 const files={...templateFiles};files['xl/worksheets/sheet1.xml']=sheetXML(result,false);files['xl/worksheets/sheet2.xml']=sheetXML(result,true);
 const n=result.bookings.length+8;
 files['xl/workbook.xml']=files['xl/workbook.xml'].replace('</x:workbook>',`<x:definedNames><x:definedName name="_xlnm.Print_Area" localSheetId="0">'예약기록'!$A$1:$I$${n}</x:definedName><x:definedName name="_xlnm.Print_Titles" localSheetId="0">'예약기록'!$8:$8</x:definedName></x:definedNames><x:calcPr calcMode="auto" fullCalcOnLoad="1"/></x:workbook>`);
 return zipFiles(files);
}
