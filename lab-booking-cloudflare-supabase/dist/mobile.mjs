// The timetable alone zooms; navigation keeps its normal touch-target size.
import {createLongPress} from './press.mjs';
export const clampScale=(value,min)=>Math.max(min,Math.min(3,value));
export function pinchView(start,distance,center,min){
 const scale=clampScale(start.scale*distance/Math.max(1,start.distance),min);
 return {scale,left:Math.max(0,start.anchorX*scale-center.x),top:Math.max(0,start.anchorY*scale-center.y)};
}
export function setupMobileBoard({getDay}){
 const $=id=>document.getElementById(id),mobile=matchMedia('(max-width:680px)'),board=document.querySelector('.board'),table=$('table'),schedule=document.querySelector('.schedule');
 const top=document.createElement('div');top.className='mobile-workbar';
 top.innerHTML=`<div class="mobile-date-row"><button id="compactPrev" aria-label="이전 날짜">‹</button><button id="compactDate" aria-label="예약 날짜 선택"></button><button id="compactNext" aria-label="다음 날짜">›</button><button id="compactToday">오늘</button></div>
 <div class="mobile-action-row"><div class="mobile-view-tabs" role="group" aria-label="예약 표시"><button id="compactTimeline" aria-pressed="true">시간표</button><button id="compactList" aria-pressed="false">목록</button></div><button id="compactSearch" aria-label="날짜 및 장비 검색"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button><button id="compactAdd" class="primary">＋ 예약</button></div>`;
 schedule.prepend(top);
 const controls=document.createElement('div');controls.className='mobile-board-tools';
 controls.innerHTML='<button id="mobileDragToggle" aria-pressed="false"><span aria-hidden="true">↔</span> 드래그 예약</button><span class="gesture-note">두 손가락 확대</span><button id="fitDay">전체 보기</button><button id="normalSize" hidden>기본 크기</button>';
 $('selectionHint').before(controls);
 const more=document.createElement('button');more.id='mobileMore';more.type='button';more.setAttribute('aria-label','더 보기');more.textContent='···';document.querySelector('header').append(more);
 const menu=document.createElement('dialog');menu.id='mobileMenu';menu.className='mobile-sheet';menu.setAttribute('aria-labelledby','mobileMenuTitle');
 menu.innerHTML='<div class="dialog-heading"><h2 id="mobileMenuTitle">예약 도구</h2><button id="closeMobileMenu" aria-label="도구 닫기">×</button></div><button id="menuRecords" class="sheet-action">기록 다운로드 <span>기간·예약자·장비별 엑셀</span></button><button id="menuRefresh" class="sheet-action">예약표 새로고침</button><details class="mobile-notice"><summary>이용 안내 · 한국시간</summary><p id="mobileNoticeText"></p></details>';
 document.body.append(menu);
 const tools=document.createElement('dialog');tools.id='mobileToolsPanel';tools.className='mobile-sheet';tools.setAttribute('aria-labelledby','mobileToolsTitle');
 tools.innerHTML='<div class="dialog-heading"><h2 id="mobileToolsTitle">날짜 · 장비 찾기</h2><button id="closeMobileTools" aria-label="검색 닫기">×</button></div>';
 document.body.append(tools);
 const aside=$('scheduleTools'),layout=document.querySelector('.layout');
 const openTools=()=>{tools.append(aside);tools.showModal();};
 tools.addEventListener('close',()=>layout.prepend(aside));
 $('closeMobileTools').onclick=()=>tools.close();$('compactSearch').onclick=$('compactDate').onclick=openTools;
 tools.addEventListener('click',e=>{if(e.target.closest('#calendar button,.day-nav button'))tools.close();});
 $('day').addEventListener('dayapplied',()=>{if(tools.open)tools.close();});
 more.onclick=()=>{$('mobileNoticeText').textContent=document.querySelector('.notice').textContent;menu.showModal();};
 $('closeMobileMenu').onclick=()=>menu.close();
 $('menuRecords').onclick=()=>{menu.close();$('exportRecords').click();};$('menuRefresh').onclick=()=>{menu.close();$('refresh').click();};
 $('compactPrev').onclick=()=>$('prev').click();$('compactNext').onclick=()=>$('next').click();$('compactToday').onclick=()=>$('today').click();$('compactAdd').onclick=()=>$('add').click();
 for(const [id,original]of [['compactTimeline','timelineView'],['compactList','listView']])$(id).onclick=()=>{$(original).click();$('compactTimeline').setAttribute('aria-pressed',String(id==='compactTimeline'));$('compactList').setAttribute('aria-pressed',String(id==='compactList'));};
 $('mobileDragToggle').onclick=()=>{const enabled=board.classList.contains('touch-select');$(enabled?'touchScroll':'touchSelect').click();};
 let scale=1,day=null,fit=false,denseMode=null,decoratedAxis=null,dateLabelDay=null;
 const dateFormatter=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'});
 const minScale=()=>Math.min(1,board.clientWidth/1030);
 function decorate(){
  const dense=mobile.matches&&scale<.7,axis=table.querySelector('.hours');
  if(denseMode!==dense||decoratedAxis!==axis){table.classList.toggle('zoom-overview',dense);axis?.querySelectorAll('span').forEach((tick,h)=>tick.hidden=dense?h%4!==0:false);denseMode=dense;decoratedAxis=axis;}
  $('fitDay').hidden=fit;$('normalSize').hidden=!fit;
 }
 function applyZoom(){
  if(dateLabelDay!==getDay()){dateLabelDay=getDay();$('compactDate').textContent=dateFormatter.format(new Date(dateLabelDay+'T00:00:00+09:00'));}
  if(!board.clientWidth)return;
  if(!mobile.matches){scale=1;fit=false;table.style.zoom='';table.style.width='100%';table.style.minWidth='0';board.scrollLeft=0;decorate();return;}
  table.style.width='1030px';table.style.minWidth='0';if(fit)scale=minScale();table.style.zoom=String(scale);decorate();
  if(day!==getDay()){day=getDay();board.scrollTop=0;board.scrollLeft=fit?0:(1030-126)*scale/24*8;}
 }
 $('fitDay').onclick=()=>{fit=true;scale=minScale();applyZoom();board.scrollLeft=0;};
 $('normalSize').onclick=()=>{fit=false;scale=1;day=null;applyZoom();};
 new ResizeObserver(applyZoom).observe(board);
 const points=new Map();let gesture=null,suppressClick=0,manualClick=false;
 const press=createLongPress({onHold:point=>{
  table.querySelectorAll('.track').forEach(t=>t.dispatchEvent(new Event('gesturecancel')));
  gesture={kind:'hold'};capture(point.id);suppressClick=performance.now()+1000;
  point.target.dispatchEvent(new Event('bookinghold'));
 }});
 const block=e=>{e.preventDefault();e.stopImmediatePropagation();};
 const position=e=>({x:e.clientX,y:e.clientY});
 const pair=()=>{const [a,b]=[...points.values()];return {distance:Math.hypot(a.x-b.x,a.y-b.y),center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};};
 const relative=p=>{const r=board.getBoundingClientRect();return {x:p.x-r.left,y:p.y-r.top};};
 const capture=id=>{try{board.setPointerCapture(id);}catch{}};
 board.addEventListener('pointerdown',e=>{
  if(!mobile.matches||e.pointerType!=='touch')return;
  points.set(e.pointerId,position(e));
  if(points.size>=2){
   press.cancel();
   // A second finger cancels any in-progress selection/move before zooming.
   table.querySelectorAll('.track').forEach(t=>t.dispatchEvent(new Event('gesturecancel')));
   for(const id of points.keys())capture(id);
   const p=pair(),c=relative(p.center);gesture={kind:'pinch',scale,distance:p.distance,anchorX:(board.scrollLeft+c.x)/scale,anchorY:(board.scrollTop+c.y)/scale};
   block(e);return;
  }
  const reservation=e.target.closest('.reservation');
  if(reservation)press.start({id:e.pointerId,...position(e),target:reservation});
  if(board.classList.contains('touch-select')&&e.target.closest('.slot,.reservation')){gesture={kind:'select'};return;}
  gesture={kind:'pan',...position(e),left:board.scrollLeft,top:board.scrollTop,target:e.target,moved:false};capture(e.pointerId);block(e);
 },true);
 board.addEventListener('pointermove',e=>{
  if(!points.has(e.pointerId)||!gesture)return;points.set(e.pointerId,position(e));
  press.move({id:e.pointerId,...position(e)});
  if(gesture.kind==='pinch'){
   if(points.size>=2){const p=pair(),v=pinchView(gesture,p.distance,relative(p.center),minScale());scale=v.scale;fit=false;table.style.zoom=String(scale);board.scrollLeft=v.left;board.scrollTop=v.top;decorate();}
   block(e);
  }else if(gesture.kind==='hold'){block(e);
  }else if(gesture.kind==='pan'){
   const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture.moved ||= Math.hypot(dx,dy)>6;
   if(gesture.moved){board.scrollLeft=gesture.left-dx;board.scrollTop=gesture.top-dy;}block(e);
  }
 },true);
 function finish(e){
  if(!points.has(e.pointerId))return;points.delete(e.pointerId);
  press.end(e.pointerId);
  if(gesture?.kind!=='select'){
   block(e);suppressClick=performance.now()+600;
   if(gesture?.kind==='pan'&&!gesture.moved&&e.type==='pointerup'){
    const button=gesture.target.closest('button');if(button){manualClick=true;button.click();manualClick=false;}
   }
   try{board.releasePointerCapture(e.pointerId);}catch{}
  }
  if(!points.size)gesture=null;
 }
 board.addEventListener('pointerup',finish,true);board.addEventListener('pointercancel',finish,true);
 board.addEventListener('click',e=>{if(!manualClick&&performance.now()<suppressClick){e.preventDefault();e.stopImmediatePropagation();}},true);
 const reset=()=>{press.cancel();points.clear();gesture=null;};window.addEventListener('blur',reset);
 mobile.addEventListener('change',()=>{reset();if(tools.open)tools.close();if(menu.open)menu.close();day=null;scale=1;fit=false;applyZoom();});
 return {applyZoom};
}
