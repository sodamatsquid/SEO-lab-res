import {createHistory,HISTORY_KEY,retentionCutoff} from './history.mjs';
import {today,shiftDay} from './core.mjs';
import {setupMobileBoard} from './mobile.mjs';
export function setupFeatures({api,getState,getDay,toast}){
 const $=id=>document.getElementById(id);let storage;try{storage=localStorage;}catch{}
 const history=createHistory(storage),details=document.createElement('details');details.className='my-history';
 details.innerHTML='<summary>내 최근 입력 관리</summary><p class="muted">이 브라우저에서 저장한 이름·조건을 각각 최근 5개까지 기억합니다. 지워도 실제 예약은 유지됩니다. 공용 PC에서는 같은 브라우저 사용자끼리 공유됩니다.</p><div id="myHistory"></div>';
 $('titleOptions').after(details);
 function renderSuggestions(){
  const data=history.read(),container=$('myHistory');container.replaceChildren();
  for(const [id,key,label]of [['personOptions','people','예약자 이름'],['titleOptions','titles','실험 제목 / 조건']]){
   $(id).replaceChildren(...data[key].map(value=>new Option(value,value)));
   const heading=document.createElement('h3');heading.textContent=label;container.append(heading);
   if(!data[key].length){const p=document.createElement('p');p.className='muted';p.textContent='아직 저장한 입력이 없습니다.';container.append(p);}
   for(const value of data[key]){
    const row=document.createElement('div');row.className='history-item';
    const use=document.createElement('button');use.type='button';use.textContent=value;use.title=value;
    use.onclick=()=>{$(key==='people'?'person':'title').value=value;$(key==='people'?'person':'title').dispatchEvent(new Event('input'));};
    const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',label+' 추천 삭제: '+value);
    remove.onclick=()=>{history.remove(key,value);renderSuggestions();toast('추천에서 지웠습니다. 실제 예약은 유지됩니다.');};row.append(use,remove);container.append(row);
   }
  }
 }
 window.addEventListener('storage',event=>{if(event.key===HISTORY_KEY||event.key===null)renderSuggestions();});
 function remember(editing,person,title){
  if(!editing||person.trim()!==editing.person)history.remember('people',person);
  if(!editing||title.trim()!==editing.title)history.remember('titles',title);
  renderSuggestions();
 }
 const {applyZoom}=setupMobileBoard({getDay});
 const download=document.createElement('button');download.id='exportRecords';download.textContent='기록 다운로드';document.querySelector('.toolbar .nav').prepend(download);
 const dialog=document.createElement('dialog');dialog.id='exportDialog';dialog.setAttribute('aria-labelledby','exportTitle');
 dialog.innerHTML=`<form id="exportForm" novalidate><div class="dialog-heading"><h2 id="exportTitle">예약 기록 다운로드</h2><button type="button" id="closeExport" aria-label="다운로드 창 닫기">×</button></div>
 <p class="muted">기간과 조건에 맞는 예약을 엑셀(.xlsx)로 저장합니다. 예약 데이터는 변경되지 않습니다.</p>
 <div class="times"><div><label for="exportFrom">시작 날짜</label><input id="exportFrom" type="date" min="2000-01-01" max="2100-12-31" required></div><div><label for="exportTo">종료 날짜</label><input id="exportTo" type="date" min="2000-01-01" max="2100-12-31" required></div></div>
 <div class="export-presets"><button type="button" id="exportMonth">선택한 달</button><button type="button" id="exportRecent">최근 4개월</button></div>
 <label for="exportPerson">예약자 이름 (선택)</label><input id="exportPerson" maxlength="40" placeholder="비워 두면 전체 · 이름 일부로 검색 가능">
 <label for="exportEquipment">장비</label><select id="exportEquipment"></select>
 <label class="check"><input id="exportCancelled" type="checkbox" checked> 취소된 예약도 포함</label>
 <p class="muted">선택 기간과 겹치는 예약의 전체 시작·종료 시간을 담습니다. 최대 366일 / 20,000건이며, 더 많으면 기간을 나누어 주세요. 엑셀에는 ‘예약기록’과 ‘원본데이터’ 시트가 포함됩니다.</p>
 <p id="retentionInfo" class="muted"></p><div id="exportError" class="error" role="alert"></div><p id="exportStatus" role="status"></p>
 <div class="actions"><button type="button" id="cancelExport">닫기</button><button type="submit" class="primary" id="saveExport">엑셀 다운로드</button></div></form>`;
 document.body.append(dialog);
 function chooseMonth(){const first=getDay().slice(0,7)+'-01',date=new Date(first+'T00:00Z');date.setUTCMonth(date.getUTCMonth()+1);$('exportFrom').value=first;$('exportTo').value=shiftDay(date.toISOString().slice(0,10),-1);}
 download.onclick=()=>{chooseMonth();$('exportPerson').value='';$('exportCancelled').checked=true;$('exportEquipment').replaceChildren(new Option('전체 장비',''),...getState().equipment.map(e=>new Option(e.name+(e.active?'':' (사용 중지)'),e.id)));$('exportError').textContent='';$('exportStatus').textContent='';$('retentionInfo').textContent='보관 기준: 오늘 기준 '+retentionCutoff(today())+' 00:00 전에 종료된 예약은 자동 정리가 활성화되면 삭제됩니다. 필요한 기록은 미리 내려받아 주세요. 작동 여부는 관리자가 Supabase에서 확인합니다.';dialog.showModal();};
 $('exportMonth').onclick=chooseMonth;$('exportRecent').onclick=()=>{$('exportFrom').value=retentionCutoff(today());$('exportTo').value=today();};
 $('closeExport').onclick=$('cancelExport').onclick=()=>dialog.close();
 $('exportForm').onsubmit=async event=>{
  event.preventDefault();$('exportError').textContent='';$('exportStatus').textContent='';
  const filters={from:$('exportFrom').value,to:$('exportTo').value,person:$('exportPerson').value.trim(),equipmentId:$('exportEquipment').value,includeCancelled:$('exportCancelled').checked};
  try{
   if(!filters.from||!filters.to||filters.from>filters.to)throw Error('시작 날짜와 종료 날짜를 올바르게 선택해 주세요.');
   if((Date.parse(filters.to)-Date.parse(filters.from))/86400000>=366)throw Error('한 번에 최대 366일까지 선택해 주세요.');
   $('saveExport').disabled=true;$('exportStatus').textContent='기록을 불러와 엑셀 파일을 만들고 있습니다…';
   const result=await api.exportBookings(filters);
   if(!result.bookings.length){$('exportStatus').textContent='조건에 맞는 예약이 없습니다. 기간이나 검색 조건을 바꿔 주세요.';return;}
   const {createBookingWorkbook}=await import('./export-xlsx.mjs');
   const bytes=createBookingWorkbook(result),blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=`예약기록_${filters.from}_${filters.to}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   $('exportStatus').textContent=`${result.bookings.length.toLocaleString()}건의 파일을 만들었습니다. 브라우저 다운로드 목록에서 확인해 주세요.`;
  }catch(e){$('exportStatus').textContent='';$('exportError').textContent=e.message;}finally{$('saveExport').disabled=false;}
 };
 return {renderSuggestions,remember,applyZoom};
}
