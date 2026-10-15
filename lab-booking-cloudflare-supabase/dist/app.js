import {api} from './api.js';
import {setupFeatures} from './features.js';
import {setupBookingInfo,setupPersistentMenu} from './booking-info.mjs';
import {createColorHistory,COLOR_KEY} from './color-history.mjs';
import {today,shiftDay,minuteLabel,dateTime,clipBooking,textColor,fullTime,toMs,local,normalizeDayInput} from './core.mjs';
const $=id=>document.getElementById(id);
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
let state={equipment:[],bookings:[]},selectedDay=today(),month=selectedDay.slice(0,7),editing=null,editingEquipment=null,loadId=0,toastTimer,contextBooking=null,pendingMove=null;
let touchSelection=false;
const mobileScreen=matchMedia('(max-width:680px)');
const features=setupFeatures({api,getState:()=>state,getDay:()=>selectedDay,toast});
const bookingInfo=setupBookingInfo({getEquipment:id=>state.equipment.find(e=>e.id===id),onEdit:openBooking,onMenu:openBookingMenu});
const bookingMenu=setupPersistentMenu($('bookingMenu'));
$('menuClose').onclick=()=>bookingMenu.close();
let colorStorage;try{colorStorage=localStorage;}catch{}
const colorHistory=createColorHistory(colorStorage);
const dragHelp=()=>mobileScreen.matches?(touchSelection?'빈 칸 드래그로 예약 · 두 손가락으로 확대':'밀어서 이동 · 빈 칸을 누르면 예약'):'빈 칸 드래그: 5분 단위 예약 · 예약 막대 드래그: 이동 · 우클릭: 수정·삭제';
const formatDate=day=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(day+'T00:00:00+09:00'));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function showError(message){$('pageError').textContent=message;$('pageError').hidden=!message;}
async function refresh(){
  const seq=++loadId,day=selectedDay;
  try{const data=await api.state(day);if(seq!==loadId)return;state=data;showError('');renderFilters();renderSuggestions();renderBoard();return true;}
  catch(e){if(seq===loadId){showError(e.message);$('table').replaceChildren(el('p','empty','예약표를 불러오지 못했습니다. 새로고침을 눌러 주세요.'));}return false;}
}
function renderFilters(){const selected=$('category').value,categories=[...new Set(state.equipment.map(e=>e.category))];$('category').replaceChildren(new Option('전체 종류',''));categories.forEach(c=>$('category').add(new Option(c,c)));if(categories.includes(selected))$('category').value=selected;$('categoryOptions').replaceChildren(...categories.map(c=>new Option(c,c)));}
function renderSuggestions(){features.renderSuggestions();}
const bookingLabel=b=>b.person+(b.title?' | '+b.title:'');
const canEdit=()=>true; // This shared board intentionally allows all visitors to edit.
function renderCalendar(){
  $('monthTitle').textContent=month.replace('-','년 ')+'월';const first=new Date(month+'-01T00:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  const nodes=Array.from({length:first.getUTCDay()},()=>el('span'));
  for(let n=1;n<=count;n++){const day=month+'-'+String(n).padStart(2,'0'),button=el('button',`${day===selectedDay?'selected ':''}${day===today()?'is-today':''}`,n);button.setAttribute('aria-label',day);button.setAttribute('aria-pressed',String(day===selectedDay));button.onclick=()=>setDay(day);nodes.push(button);}
  $('calendar').replaceChildren(...nodes);
}
function setDay(day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'2000-01-01'||day>'2100-12-31')return;selectedDay=day;month=day.slice(0,7);$('day').value=day;$('dayError').textContent='';$('dateTitle').textContent=formatDate(day);renderCalendar();refresh();}
function applyDayInput(){try{setDay(normalizeDayInput($('day').value));$('day').dispatchEvent(new Event('dayapplied'));}catch(e){$('dayError').textContent=e.message;}}
$('applyDay').onclick=applyDayInput;$('day').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyDayInput();}});
function changeMonth(delta){const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);if(d.getUTCFullYear()<2000||d.getUTCFullYear()>2100)return;month=d.toISOString().slice(0,7);renderCalendar();}
function visibleEquipment(){const search=$('search').value.toLocaleLowerCase().trim(),category=$('category').value;return state.equipment.filter(e=>(e.active||$('showInactive').checked||state.bookings.some(b=>b.equipmentId===e.id))&&(!search||e.name.toLocaleLowerCase().includes(search))&&(!category||category===e.category));}
function enableDrag(track,device){
  if(!device.active)return;let selection=null,lastHandled=-1000,scrollFrame=0;
  const board=document.querySelector('.board');
  const minuteAt=event=>{const rect=track.getBoundingClientRect();return Math.max(0,Math.min(1440,Math.round((event.clientX-rect.left)/rect.width*1440/5)*5));};
  const bounds=()=>{const start=Math.min(selection.first,selection.last);return {start:Math.min(start,1435),end:Math.min(1440,Math.max(start+5,selection.first,selection.last))};};
  const overlay=el('div','selection-range');
  const clear=()=>{selection=null;cancelAnimationFrame(scrollFrame);overlay.remove();$('selectionHint').textContent=dragHelp();};
  const highlight=()=>{const {start,end}=bounds();overlay.style.left=start/1440*100+'%';overlay.style.width=(end-start)/1440*100+'%';overlay.dataset.label=minuteLabel(start)+' ~ '+minuteLabel(end);$('selectionHint').textContent=`${device.name} · ${minuteLabel(start)} ~ ${minuteLabel(end)} 선택 중 (5분 단위)`;};
  const scrollAtEdge=()=>{
    if(!selection)return;
    if(selection.moved){
      const rect=board.getBoundingClientRect(),left=track.previousElementSibling.getBoundingClientRect().right,right=rect.left+board.clientWidth;
      const speed=selection.clientX>right-24?7:selection.clientX<left+24?-7:0,previous=board.scrollLeft;
      if(speed)board.scrollLeft+=speed;
      if(board.scrollLeft!==previous){selection.last=minuteAt({clientX:Math.max(left,Math.min(right,selection.clientX))});highlight();}
    }
    scrollFrame=requestAnimationFrame(scrollAtEdge);
  };
  track.addEventListener('pointerdown',event=>{if((event.pointerType==='touch'&&!touchSelection)||event.button!==0||!event.target.closest('.slot')||selection)return;event.preventDefault();const first=Math.min(1435,minuteAt(event));selection={first,last:first,pointerId:event.pointerId,x:event.clientX,clientX:event.clientX,moved:false};track.append(overlay);track.setPointerCapture(event.pointerId);highlight();scrollFrame=requestAnimationFrame(scrollAtEdge);});
  track.addEventListener('pointermove',event=>{if(!selection||selection.pointerId!==event.pointerId)return;selection.clientX=event.clientX;selection.last=minuteAt(event);selection.moved ||= Math.abs(event.clientX-selection.x)>=3;highlight();});
  track.addEventListener('pointerup',event=>{if(!selection||selection.pointerId!==event.pointerId)return;selection.last=minuteAt(event);const {start,end}=bounds(),moved=selection.moved,clickStart=Math.floor(selection.first/30)*30;lastHandled=event.timeStamp;clear();track.releasePointerCapture(event.pointerId);openBooking(null,device.id,moved?start:clickStart,moved?end:null);});
  track.addEventListener('pointercancel',clear);track.addEventListener('lostpointercapture',clear);
  track.addEventListener('gesturecancel',clear);
  track.addEventListener('click',event=>{if(event.detail!==0&&event.timeStamp-lastHandled<500){event.preventDefault();event.stopImmediatePropagation();}},true);
}
function enableBookingActions(bar,booking,track){
  let move=null,lastMoved=-1000;
  const board=document.querySelector('.board');
  const reset=()=>{move=null;bar.style.transform='';bar.style.pointerEvents='';bar.classList.remove('moving');};
  bar.addEventListener('pointerdown',event=>{if(event.button!==0||(event.pointerType==='touch'&&!touchSelection)||!canEdit(booking)||move)return;event.preventDefault();move={pointerId:event.pointerId,x:event.clientX,y:event.clientY,scroll:board.scrollLeft,moved:false,delta:0,target:null};bar.setPointerCapture(event.pointerId);});
  function updateMove(event){
    if(!move||move.pointerId!==event.pointerId)return;
    const dx=event.clientX-move.x+board.scrollLeft-move.scroll,dy=event.clientY-move.y;
    move.moved ||= Math.hypot(dx,dy)>4;if(!move.moved)return;
    move.delta=Math.round(dx/track.getBoundingClientRect().width*1440/5)*5;
    bar.classList.add('moving');bar.style.pointerEvents='none';bar.style.transform=`translate(${dx}px,${dy}px)`;
    const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('.line[data-equipment-id]');
    const name=row?.querySelector('.name').getBoundingClientRect(),rect=board.getBoundingClientRect();
    move.target=row&&event.clientX>=name.right&&event.clientX<rect.right&&event.clientY>rect.top&&event.clientY<rect.bottom?state.equipment.find(e=>e.id===row.dataset.equipmentId):null;
    if(move.target&&!move.target.active&&move.target.id!==booking.equipmentId)move.target=null;
    $('selectionHint').textContent=move.target?`${move.target.name} · ${fullTime(local(toMs(booking.start)+move.delta*60000))} ~ ${fullTime(local(toMs(booking.end)+move.delta*60000))}로 이동`:'예약할 장비의 시간표 안에 놓아 주세요.';
  }
  bar.addEventListener('pointermove',updateMove);
  bar.addEventListener('pointerup',event=>{
    if(!move||move.pointerId!==event.pointerId)return;updateMove(event);const action={...move};if(action.moved)lastMoved=event.timeStamp;reset();bar.releasePointerCapture(event.pointerId);
    if(!action.moved)return;
    $('selectionHint').textContent='빈 칸 드래그: 5분 단위 예약 · 예약 막대 드래그: 이동 · 우클릭: 수정·삭제';
    if(!action.target){toast('시간표 안에 놓아 주세요. 기존 예약은 유지됩니다.');return;}
    if(action.delta===0&&action.target.id===booking.equipmentId)return;
    const updated={...booking,equipmentId:action.target.id,start:local(toMs(booking.start)+action.delta*60000),end:local(toMs(booking.end)+action.delta*60000)};
    requestMove(booking,updated);
  });
  bar.addEventListener('pointercancel',reset);bar.addEventListener('lostpointercapture',reset);
  bar.addEventListener('gesturecancel',reset);
  bar.addEventListener('click',event=>{if(event.detail!==0&&event.timeStamp-lastMoved<500){event.preventDefault();event.stopImmediatePropagation();}},true);
}
function requestMove(original,updated){
  pendingMove=updated;
  const description=b=>`${state.equipment.find(e=>e.id===b.equipmentId)?.name||'장비'}\n${fullTime(b.start)} ~ ${fullTime(b.end)}`;
  $('moveBookingLabel').textContent=bookingLabel(original);$('moveFrom').textContent=description(original);$('moveTo').textContent=description(updated);$('moveError').textContent='';
  $('moveModal').showModal();$('cancelMove').focus();
}
$('cancelMove').onclick=()=>{if(!$('confirmMove').disabled)$('moveModal').close();};
$('moveModal').addEventListener('cancel',event=>{if($('confirmMove').disabled)event.preventDefault();});
$('moveModal').addEventListener('close',()=>{pendingMove=null;});
$('confirmMove').onclick=async()=>{
  if(!pendingMove||$('confirmMove').disabled)return;
  const updated=pendingMove;$('confirmMove').disabled=true;$('cancelMove').disabled=true;$('moveError').textContent='';
  try{await api.saveBooking(updated,updated.id);$('moveModal').close();await refresh();toast('예약을 이동했습니다.');}
  catch(e){$('moveError').textContent=e.message+'\n이동하지 못했습니다. 기존 예약은 유지됩니다.';}
  finally{$('confirmMove').disabled=false;$('cancelMove').disabled=false;}
};
const rowCache=new Map();let renderFrame=0;
function queueBoardRender(){cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(renderBoard);}
function renderBoard(){
  bookingInfo.hide();
  const table=$('table'),devices=visibleEquipment(),fragment=document.createDocumentFragment(),axis=el('div','line axis');axis.append(el('div','name','장비 / 시간'));
  const hours=el('div','hours');
  for(let h=0;h<=24;h++){
    const tick=el('span',h===24?'last':'',String(h).padStart(2,'0'));
    tick.title=minuteLabel(h*60);tick.setAttribute('aria-label',minuteLabel(h*60));
    if(h<24)tick.style.left=h/24*100+'%';
    hours.append(tick);
  }
  axis.append(hours);fragment.append(axis);
  const grouped=new Map();for(const b of state.bookings){if(!grouped.has(b.equipmentId))grouped.set(b.equipmentId,[]);grouped.get(b.equipmentId).push(b);}
  for(const id of rowCache.keys())if(!state.equipment.some(e=>e.id===id))rowCache.delete(id);
  for(const device of devices){
    const signature=JSON.stringify(device);let cached=rowCache.get(device.id);
    if(!cached||cached.signature!==signature){
    const row=el('div','line'),name=el('div','name'+(!device.active?' inactive':''),device.name+(!device.active?' · 중지':''));row.dataset.equipmentId=device.id;name.title=device.name+(device.usageNote?'\n이용 안내: '+device.usageNote:'');row.append(name);
    const track=el('div','track');enableDrag(track,device);
    for(let i=0;i<48;i++){const slot=el('button','slot');slot.setAttribute('aria-label',`${device.name} ${minuteLabel(i*30)} 예약`);slot.disabled=!device.active;slot.onclick=()=>openBooking(null,device.id,i*30);track.append(slot);}
    track.addEventListener('gesturecancel',()=>track.querySelectorAll('.reservation').forEach(bar=>bar.dispatchEvent(new Event('gesturecancel'))));
    row.append(track);cached={row,track,signature,bookings:null};rowCache.set(device.id,cached);
    }
    const {row,track}=cached,bookings=grouped.get(device.id)||[],key=selectedDay+JSON.stringify(bookings);
    if(cached.bookings!==key){
    track.dispatchEvent(new Event('gesturecancel'));track.querySelectorAll('.reservation').forEach(bar=>bar.remove());
    for(const b of bookings){
      const clip=clipBooking(b,selectedDay);if(!clip)continue;const label=bookingLabel(b),bar=el('button','reservation',(clip.before?'‹ ':'')+label+(clip.after?' ›':''));
      bar.style.left=clip.start/1440*100+'%';bar.style.width=(clip.end-clip.start)/1440*100+'%';bar.style.background=b.color;bar.style.color=textColor(b.color);bar.setAttribute('aria-label',`${label}, ${fullTime(b.start)} ~ ${fullTime(b.end)}, 상세 보기`);bookingInfo.bind(bar,b);enableBookingActions(bar,b,track);track.append(bar);
    }cached.bookings=key;}fragment.append(row);
  }
  if(!devices.length)fragment.append(el('p','empty','해당하는 장비가 없습니다. 검색어와 종류를 확인해 주세요.'));
  table.replaceChildren(fragment);$('summary').textContent=`장비 ${devices.length}대 / 전체 ${state.equipment.length}대 · 표시된 예약 ${state.bookings.filter(b=>devices.some(d=>d.id===b.equipmentId)).length}건`;
  renderBookingList(devices);
  features.applyZoom();
}
const listFilters=el('details','list-filters');
listFilters.innerHTML='<summary><span>조건별 보기</span><span id="listFilterSummary">전체 예약</span><span class="filter-chevron" aria-hidden="true">⌄</span></summary><div class="list-filter-fields"><div><label for="listPerson">예약자</label><select id="listPerson"><option value="">전체 예약자</option></select></div><div><label for="listCategory">장비 종류</label><select id="listCategory"><option value="">전체 종류</option></select></div><div><label for="listEquipment">장비</label><select id="listEquipment"><option value="">전체 장비</option></select></div><button type="button" id="clearListFilters">조건 초기화</button></div>';
$('bookingList').before(listFilters);
function syncListVisibility(){listFilters.hidden=!(mobileScreen.matches&&document.querySelector('.schedule').classList.contains('list-view'));}
syncListVisibility();mobileScreen.addEventListener('change',syncListVisibility);
const listStatus=el('div','list-status');listStatus.id='listStatus';listStatus.setAttribute('aria-live','polite');$('bookingList').before(listStatus);
for(const id of ['listPerson','listCategory','listEquipment'])$(id).onchange=()=>{bookingInfo.hide();renderBookingList(visibleEquipment());};
$('clearListFilters').onclick=()=>{$('listPerson').value='';$('listCategory').value='';$('listEquipment').value='';renderBookingList(visibleEquipment());};
function renderBookingList(devices){
  const person=$('listPerson').value,category=$('listCategory').value;let equipment=$('listEquipment').value;
  const categories=[...new Set(state.equipment.map(e=>e.category))];
  $('listCategory').replaceChildren(new Option('전체 종류',''),...categories.map(c=>new Option(c,c)));$('listCategory').value=category;
  const eligible=state.equipment.filter(e=>!category||e.category===category);if(!eligible.some(e=>e.id===equipment))equipment='';
  const people=[...new Set(state.bookings.map(b=>b.person))].sort((a,b)=>a.localeCompare(b,'ko'));
  if(person&&!people.includes(person))people.push(person);
  $('listPerson').replaceChildren(new Option('전체 예약자',''),...people.map(p=>new Option(p,p)));$('listPerson').value=person;
  $('listEquipment').replaceChildren(new Option('전체 장비',''),...eligible.map(e=>new Option(e.name,e.id)));$('listEquipment').value=equipment;
  const visible=state.bookings.filter(b=>devices.some(d=>d.id===b.equipmentId)&&eligible.some(d=>d.id===b.equipmentId)&&(!person||b.person===person)&&(!equipment||b.equipmentId===equipment)).sort((a,b)=>a.start.localeCompare(b.start));
  const captions=[person,category,equipment?state.equipment.find(e=>e.id===equipment)?.name:''].filter(Boolean);
  $('listFilterSummary').textContent=captions.join(' · ')||'전체 예약';listFilters.classList.toggle('has-filter',captions.length>0);
  listStatus.textContent=`예약 ${visible.length}건 · ${$('search').value||$('category').value?'장비 검색 조건 적용 중':'선택한 날짜'} · 길게 눌러 수정·삭제`;
  const cards=visible.map(b=>{
    const device=devices.find(d=>d.id===b.equipmentId),card=el('button','booking-card');card.type='button';card.style.borderLeftColor=b.color;
    card.append(el('span','list-equipment',device.name),el('strong','',bookingLabel(b)),el('span','list-time',`${fullTime(b.start)} ~ ${fullTime(b.end)}`));
    card.setAttribute('aria-label',`${device.name}, ${bookingLabel(b)}, 상세 보기`);bookingInfo.bind(card,b,{list:true});return card;
  });
  $('bookingList').replaceChildren(...(cards.length?cards:[el('p','empty','조건에 맞는 예약이 없습니다. 날짜나 조회 조건을 바꿔 주세요.')]));
}
function setTouchSelection(enabled){
  touchSelection=enabled;document.querySelector('.board').classList.toggle('touch-select',enabled);
  $('touchSelect').setAttribute('aria-pressed',String(enabled));$('touchScroll').setAttribute('aria-pressed',String(!enabled));
  $('mobileDragToggle').setAttribute('aria-pressed',String(enabled));
  $('selectionHint').textContent=dragHelp();
}
$('touchScroll').onclick=()=>setTouchSelection(false);$('touchSelect').onclick=()=>setTouchSelection(true);
mobileScreen.addEventListener('change',()=>setTouchSelection(false));
setTouchSelection(false);
$('toggleTools').onclick=()=>{
  const open=document.querySelector('.layout').classList.toggle('tools-open');$('toggleTools').setAttribute('aria-expanded',String(open));
  $('toggleTools').textContent=open?'날짜 · 장비 찾기 ▴':'날짜 · 장비 찾기 ▾';
};
for(const [id,list] of [['timelineView',false],['listView',true]])$(id).onclick=()=>{
  document.querySelector('.schedule').classList.toggle('list-view',list);syncListVisibility();
  $('timelineView').setAttribute('aria-pressed',String(!list));$('listView').setAttribute('aria-pressed',String(list));
};
$('mobilePrev').onclick=()=>setDay(shiftDay(selectedDay,-1));$('mobileNext').onclick=()=>setDay(shiftDay(selectedDay,1));$('mobileToday').onclick=()=>setDay(today());
function updateColor(){const color=$('color').value;$('currentSwatch').style.background=color;$('currentSwatch').title=color;$('colorPreview').style.background=color;$('colorPreview').style.color=textColor(color);$('colorPreview').textContent=($('person').value||'예약자')+' | '+($('title').value||'실험 제목');document.querySelectorAll('.swatch').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color)));}
function deviceNote(){const device=state.equipment.find(e=>e.id===$('device').value);$('deviceNote').textContent=device?.usageNote?'이용 안내: '+device.usageNote:'';}
function openBooking(booking=null,deviceId=null,start=540,end=null){
  bookingInfo.hide();
  editing=booking?{...booking}:null;$('form').reset();$('error').textContent='';$('formTitle').textContent=booking?'예약 상세 · 수정':'새 예약';$('remove').hidden=!booking;
  const editable=canEdit(booking);
  $('form').querySelectorAll('input,select,textarea,.swatch,#moreColors').forEach(e=>e.disabled=!editable);$('saveBooking').hidden=!editable;$('remove').hidden=!booking||!editable;if(!editable)$('formTitle').textContent='예약 상세 · 조회만 가능';
  $('device').replaceChildren(...state.equipment.filter(e=>e.active||e.id===booking?.equipmentId).map(e=>new Option(e.name+(!e.active?' (사용 중지)':''),e.id)));
  if(!$('device').options.length){toast('먼저 사용 가능한 장비를 추가해 주세요.');return;}
  if(booking||deviceId)$('device').value=booking?.equipmentId||deviceId;
  const from=booking?.start||dateTime(selectedDay,minuteLabel(start)),to=booking?.end||(end===null?local(toMs(from)+3600000):dateTime(selectedDay,minuteLabel(end)));
  $('startDate').value=from.slice(0,10);$('startTime').value=from.slice(11);$('endDate').value=to.slice(0,10);$('endTime').value=to.slice(11);
  $('person').value=booking?.person||'';$('title').value=booking?.title||'';$('memo').value=booking?.memo||'';$('color').value=booking?.color||colorHistory.latest();deviceNote();updateColor();$('modal').showModal();
}
function closeBooking(){if(!$('saveBooking').disabled)$('modal').close();}
$('form').onsubmit=async event=>{
  event.preventDefault();$('error').textContent='';
  try{
    for(const [id,label]of [['device','장비'],['startDate','시작 날짜'],['endDate','종료 날짜'],['startTime','시작 시간'],['endTime','종료 시간'],['person','예약자 이름']])if(!$(id).value.trim())throw Error(label+'을(를) 입력해 주세요.');
    const start=dateTime($('startDate').value,$('startTime').value),end=dateTime($('endDate').value,$('endTime').value);
    if(toMs(end)<=toMs(start))throw Error('종료 날짜·시간은 시작 날짜·시간보다 늦어야 합니다.');
    $('saveBooking').disabled=true;$('remove').disabled=true;
    await api.saveBooking({equipmentId:$('device').value,start,end,person:$('person').value,title:$('title').value,color:$('color').value,memo:$('memo').value,version:editing?.version},editing?.id);
    features.remember(editing,$('person').value,$('title').value);
    $('modal').close();await refresh();toast(editing?'예약을 수정했습니다.':'예약을 저장했습니다.');
  }catch(e){$('error').textContent=e.message;}finally{$('saveBooking').disabled=false;$('remove').disabled=false;}
};
function requestCancellation(booking){editing=booking;$('confirmText').textContent=`${bookingLabel(booking)}\n${fullTime(booking.start)} ~ ${fullTime(booking.end)}`;$('cancelError').textContent='';$('confirmModal').showModal();}
function openBookingMenu(booking,point,touch=false){
  bookingInfo.hide();contextBooking={...booking};const menu=$('bookingMenu');
  menu.classList.toggle('touch-menu',touch);$('menuEdit').textContent='예약 수정';$('menuDelete').hidden=!canEdit(booking);
  let caption=$('bookingMenuCaption');if(!caption){caption=el('p','menu-caption');caption.id='bookingMenuCaption';menu.prepend(caption);}
  caption.textContent=bookingLabel(booking);menu.style.left=Math.max(8,Math.min(point.left,innerWidth-190))+'px';menu.style.top=Math.max(8,Math.min(point.bottom,innerHeight-170))+'px';bookingMenu.open(touch);
}
$('remove').onclick=()=>{if(editing)requestCancellation(editing);};
$('keepBooking').onclick=()=>$('confirmModal').close();
$('menuEdit').onclick=()=>{bookingMenu.close();if(contextBooking)openBooking(contextBooking);};
$('menuDelete').onclick=()=>{bookingMenu.close();if(contextBooking&&canEdit(contextBooking))requestCancellation(contextBooking);};
$('confirmCancel').onclick=async()=>{if(!editing)return;$('confirmCancel').disabled=true;try{await api.cancelBooking(editing.id,editing.version);$('confirmModal').close();$('modal').close();await refresh();toast('예약을 취소했습니다.');}catch(e){$('cancelError').textContent=e.message;}finally{$('confirmCancel').disabled=false;}};
function editEquipment(device=null){editingEquipment=device?.id||null;$('equipmentForm').reset();$('equipmentTitle').textContent=device?'장비 수정':'장비 추가';$('equipmentName').value=device?.name||'';$('equipmentCategory').value=device?.category||'';$('equipmentOrder').value=device?.sortOrder||Math.max(0,...state.equipment.map(e=>e.sortOrder))+1;$('equipmentActive').checked=device?.active??true;$('equipmentNote').value=device?.usageNote||'';$('equipmentError').textContent='';}
function renderManager(){
  $('equipmentList').replaceChildren(...state.equipment.map((device,index)=>{
    const item=el('div','equipment-item'),edit=el('button','',device.name);edit.append(el('small','',`${device.sortOrder} · ${device.category} · ${device.active?'사용 중':'사용 중지'}`));edit.onclick=()=>editEquipment(device);item.append(edit);
    for(const [delta,label]of [[-1,'위로'],[1,'아래로']]){const button=el('button','move',delta===-1?'↑':'↓');button.setAttribute('aria-label',device.name+' '+label);button.disabled=index+delta<0||index+delta>=state.equipment.length;button.onclick=async()=>{button.disabled=true;try{const ids=state.equipment.map(e=>e.id);[ids[index],ids[index+delta]]=[ids[index+delta],ids[index]];await api.reorder(ids);await refresh();renderManager();if(editingEquipment)editEquipment(state.equipment.find(e=>e.id===editingEquipment));}catch(e){$('equipmentError').textContent=e.message;}finally{button.disabled=false;}};item.append(button);}return item;
  }));
}
$('manage').onclick=async()=>{if(await refresh()){renderManager();editEquipment();$('manager').showModal();}};
$('equipmentForm').onsubmit=async event=>{event.preventDefault();$('equipmentError').textContent='';$('saveEquipment').disabled=true;try{const saved=await api.saveEquipment({name:$('equipmentName').value,category:$('equipmentCategory').value,sortOrder:Number($('equipmentOrder').value),active:$('equipmentActive').checked,usageNote:$('equipmentNote').value},editingEquipment);await refresh();renderManager();editEquipment(saved);toast('장비 정보를 저장했습니다.');}catch(e){$('equipmentError').textContent=e.message;}finally{$('saveEquipment').disabled=false;}};
$('newEquipment').onclick=()=>{editEquipment();$('equipmentName').focus();};$('closeManager').onclick=()=>$('manager').close();
$('device').onchange=deviceNote;$('color').oninput=updateColor;$('person').oninput=updateColor;$('title').oninput=updateColor;$('cancel').onclick=closeBooking;$('closeBooking').onclick=closeBooking;
$('color').onchange=()=>rememberColor($('color').value);
$('add').onclick=()=>openBooking();$('refresh').onclick=refresh;$('prev').onclick=()=>setDay(shiftDay(selectedDay,-1));$('next').onclick=()=>setDay(shiftDay(selectedDay,1));$('today').onclick=()=>setDay(today());$('monthPrev').onclick=()=>changeMonth(-1);$('monthNext').onclick=()=>changeMonth(1);$('search').oninput=queueBoardRender;$('category').onchange=renderBoard;$('showInactive').onchange=renderBoard;
for(let n=0;n<=1440;n+=30)$('timeOptions').append(new Option(minuteLabel(n),minuteLabel(n)));
function swatch(color,name,parent){const button=el('button','swatch');button.type='button';button.style.background=color;button.dataset.color=color;button.title=name;button.setAttribute('aria-label',name);button.onclick=()=>{$('color').value=color;rememberColor(color);$('morePalettePanel').hidePopover();};$(parent).append(button);}
function rememberColor(color){colorHistory.remember(color);renderRecentColors();updateColor();}
const recentColors=el('div','recent-colors');recentColors.innerHTML='<span>최근 색상</span><div id="recentColors" role="group" aria-label="이 브라우저의 최근 색상"></div><button type="button" id="clearRecentColors">지우기</button>';
document.querySelector('.current-color').after(recentColors);
function renderRecentColors(){const values=colorHistory.read();recentColors.hidden=!values.length;$('recentColors').replaceChildren();values.forEach(c=>swatch(c,'최근 색상 '+c,'recentColors'));}
$('clearRecentColors').onclick=()=>{colorHistory.clear();renderRecentColors();toast('이 브라우저의 최근 색상만 지웠습니다.');};
window.addEventListener('storage',e=>{if(e.key===COLOR_KEY||e.key===null)renderRecentColors();});renderRecentColors();
for(const [color,name] of [['#de3323','빨강'],['#fbfe57','노랑'],['#86fa4f','연두'],['#8ffbfd','하늘'],['#351af4','파랑'],['#e23bf6','자홍'],['#6e140c','적갈색'],['#7e7f27','올리브'],['#407d23','초록'],['#457e7f','청록'],['#15077a','남색'],['#71187b','보라'],['#000000','검정'],['#808080','회색'],['#c0c0c0','은색'],['#ffffff','흰색']])swatch(color,name,'palette');
const colorRows=[
  ['#6e140c','#863a16','#32330a','#163209','#1d3362','#15077a','#3b3593','#000000'],
  ['#de3323','#e26f2e','#7e7f27','#407d23','#457e7f','#351af4','#686795','#404040'],
  ['#e23bf6','#e89d3a','#a5ca41','#5b976b','#78c9ca','#5568f5','#71187b','#606060'],
  ['#ea9eca','#f0cd48','#fbfe57','#86fa4f','#8ffbfd','#75caf9','#873b64','#808080'],
  ['#f3cecd','#f1cda0','#fcfea6','#dafdd1','#dcfefe','#accbfa','#c49df8','#a0a0a0'],
  ['#f5ebd9','#ebe698','#759c9f','#88fa8f','#bc6e34','#5a6a37','#9b302a','#c0c0c0'],
  ['#f8e5e2','#8acaac','#8f73d4','#df347f','#c68476','#211c6b','#e1a76c','#e0e0e0'],
  ['#cba642','#a5f850','#e26d52','#cba642','#c2fc5e','#c777d0','#3a4e4f','#ffffff']
];
colorRows.forEach((row,y)=>row.forEach((color,x)=>swatch(color,`${y+1}행 ${x+1}열 ${color}`,'morePalette')));
$('morePalettePanel').addEventListener('beforetoggle',event=>{if(event.newState!=='open')return;const r=$('moreColors').getBoundingClientRect(),panel=$('morePalettePanel');panel.style.left=Math.max(8,Math.min(r.left,window.innerWidth-260))+'px';panel.style.top=Math.max(8,r.bottom+300<window.innerHeight?r.bottom+5:r.top-295)+'px';});
if(api.online){
  try{sessionStorage.removeItem('lab-booking-supabase-session');}catch{}
  document.querySelector('.tag').textContent='온라인 공동 예약 · 로그인 없음';
  document.querySelector('.notice').textContent='누구나 예약 등록·수정·취소와 장비 관리를 할 수 있습니다. 예약은 온라인에 저장됩니다. 시간 기준: 한국시간 (Asia/Seoul)';
}
setDay(selectedDay);
