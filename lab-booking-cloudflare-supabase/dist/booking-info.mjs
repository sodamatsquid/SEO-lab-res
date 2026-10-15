import {toMs} from './core.mjs';
import {createLongPress} from './press.mjs';
export function setupPersistentMenu(menu,root=document){
 let touch=false,armed=false;
 const close=()=>{menu.hidePopover();armed=false;};
 root.addEventListener('pointerdown',e=>{
  if(!touch||!menu.matches(':popover-open'))return;
  if(menu.contains(e.target))armed=true;else close();
 },true);
 root.addEventListener('keydown',e=>{if(e.key==='Escape'&&touch&&menu.matches(':popover-open')){e.preventDefault();close();}});
 menu.addEventListener('click',e=>{
  if(touch&&e.detail!==0&&!armed){e.preventDefault();e.stopImmediatePropagation();return;}
  armed=false;
 },true);
 return {open(isTouch){close();touch=isTouch;menu.setAttribute('popover',touch?'manual':'auto');menu.showPopover();},close};
}
export function tooltipPosition({point,anchor,width,height,viewportWidth,viewportHeight}){
 const x=point?.x??Math.max(10,anchor.left),y=point?.y??anchor.bottom;
 return {left:Math.max(10,Math.min(x+(point?12:0),viewportWidth-width-10)),top:Math.max(10,y+height+22<=viewportHeight?y+12:(point?.y??anchor.top)-height-12)};
}
const make=(tag,className,text)=>{const e=document.createElement(tag);e.className=className;if(text!==undefined)e.textContent=text;return e;};
export function bookingTimeInfo(booking){
 const date=value=>new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(toMs(value)));
 const minutes=Math.round((toMs(booking.end)-toMs(booking.start))/60000),hours=Math.floor(minutes/60),rest=minutes%60;
 return {startDate:date(booking.start),endDate:date(booking.end),startTime:booking.start.slice(11),endTime:booking.end.slice(11),duration:(hours?hours+'시간':'')+(hours&&rest?' ':'')+(rest?rest+'분':'')};
}
export function setupBookingInfo({getEquipment,onEdit,onMenu}){
 const mobile=matchMedia('(max-width:680px)');
 const tooltip=make('div','booking-info booking-tooltip');tooltip.id='bookingTooltip';tooltip.setAttribute('popover','manual');tooltip.setAttribute('role','tooltip');
 const sheet=make('dialog','booking-info booking-detail');sheet.id='bookingDetail';sheet.setAttribute('aria-label','예약 상세 정보');
 document.body.append(tooltip,sheet);
 let showTimer,hideTimer,anchor=null,activeListPress=null;
 function hide(){clearTimeout(showTimer);clearTimeout(hideTimer);tooltip.hidePopover();anchor?.removeAttribute('aria-describedby');anchor=null;}
 function content(booking,detail){
  if(!detail){
   const body=make('div','hover-content'),time=bookingTimeInfo(booking);
   body.append(make('div','hover-equipment',getEquipment(booking.equipmentId)?.name||'장비'),make('strong','hover-person',booking.person));
   if(booking.title)body.append(make('p','hover-title',booking.title));
   const times=make('div','hover-times');
   if(time.startDate===time.endDate){times.append(make('span','hover-date',time.startDate),make('strong','hover-clock',time.startTime+' – '+time.endTime));}
   else{times.append(make('span','hover-date','시작 '+time.startDate),make('strong','hover-clock',time.startTime),make('span','hover-date','종료 '+time.endDate),make('strong','hover-clock',time.endTime));}
   body.append(times,make('p','hover-duration',time.duration+' · 한국시간'));
   if(booking.memo)body.append(make('p','hover-memo',booking.memo));
   body.append(make('p','hover-help','클릭 수정 · 우클릭 메뉴'));return body;
  }
  const body=make('div','info-content'),head=make('div','info-heading'),equipment=make('span','info-equipment',getEquipment(booking.equipmentId)?.name||'장비');
  head.append(equipment);
  if(detail){const close=make('button','info-close','×');close.type='button';close.setAttribute('aria-label','예약 정보 닫기');close.onclick=()=>sheet.close();head.append(close);}
  body.append(head,make('h2','info-person',booking.person));
  const title=make('p','info-title',booking.title||'실험 조건 미입력');if(!booking.title)title.classList.add('info-empty');body.append(title);
  const time=bookingTimeInfo(booking),times=make('div','info-times');
  for(const [label,date,clock] of [['시작',time.startDate,time.startTime],['종료',time.endDate,time.endTime]]){const cell=make('div','info-time');cell.append(make('span','info-time-label',label),make('strong','info-clock',clock),make('span','info-date',date));times.append(cell);}
  body.append(times,make('p','info-duration',time.duration+' 예약 · 한국시간'));
  if(booking.memo){const memo=make('div','info-memo');memo.append(make('span','info-time-label','상세 메모'),make('p','',booking.memo));body.append(memo);}
  body.append(make('p','info-help',detail?'예약 막대를 길게 누르면 수정·삭제할 수 있습니다.':'클릭하여 수정 · 우클릭하여 메뉴 열기'));
  return body;
 }
 function place(target,point){
  const pos=tooltipPosition({point,anchor:target.getBoundingClientRect(),width:tooltip.offsetWidth,height:tooltip.offsetHeight,viewportWidth:innerWidth,viewportHeight:innerHeight});
  tooltip.style.left=pos.left+'px';tooltip.style.top=pos.top+'px';
 }
 function preview(booking,target,point){
  hide();anchor=target;tooltip.style.setProperty('--booking-color',booking.color);tooltip.replaceChildren(content(booking,false));tooltip.showPopover();target.setAttribute('aria-describedby',tooltip.id);place(target,point);
 }
 function details(booking){hide();sheet.style.setProperty('--booking-color',booking.color);sheet.replaceChildren(content(booking,true));if(!sheet.open)sheet.showModal();}
 tooltip.addEventListener('pointerenter',()=>clearTimeout(hideTimer));tooltip.addEventListener('pointerleave',()=>{hideTimer=setTimeout(hide,120);});
 sheet.addEventListener('click',e=>{if(e.target===sheet){const r=sheet.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)sheet.close();}});
 window.addEventListener('scroll',e=>{if(!tooltip.contains(e.target))hide();},true);window.addEventListener('resize',hide);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide();});
 document.addEventListener('pointerdown',e=>{if(!tooltip.contains(e.target))hide();if(e.pointerType==='touch'&&!e.isPrimary)activeListPress?.cancel();},true);
 function bind(target,booking,{list=false}={}){
  let lastTouch=false,suppressUntil=0,pointer=null;
  const hold=()=>{hide();onMenu(booking,target.getBoundingClientRect(),true);};
  target.addEventListener('pointerenter',e=>{if(e.pointerType==='touch'||mobile.matches||e.buttons)return;pointer={x:e.clientX,y:e.clientY};clearTimeout(hideTimer);showTimer=setTimeout(()=>preview(booking,target,pointer),160);});
  target.addEventListener('pointermove',e=>{if(e.pointerType==='touch'||mobile.matches||e.buttons)return;pointer={x:e.clientX,y:e.clientY};if(anchor===target)place(target,pointer);});
  target.addEventListener('pointerleave',()=>{clearTimeout(showTimer);hideTimer=setTimeout(hide,120);});
  target.addEventListener('focus',()=>{if(!mobile.matches&&!lastTouch&&target.matches(':focus-visible'))showTimer=setTimeout(()=>preview(booking,target),160);});
  target.addEventListener('blur',hide);
  target.addEventListener('pointerdown',e=>{lastTouch=e.pointerType==='touch';hide();});
  target.onclick=e=>{if(performance.now()<suppressUntil){e.preventDefault();return;}hide();if(mobile.matches||lastTouch)details(booking);else onEdit(booking);};
  target.addEventListener('bookinghold',()=>{lastTouch=true;suppressUntil=performance.now()+900;hold();});
  target.addEventListener('contextmenu',e=>{e.preventDefault();hide();if(!lastTouch)onMenu(booking,{left:e.clientX,bottom:e.clientY},mobile.matches);});
  target.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||e.key==='F10'&&e.shiftKey){e.preventDefault();hide();onMenu(booking,target.getBoundingClientRect(),mobile.matches);}});
  if(list){
   const press=createLongPress({onHold:()=>{suppressUntil=performance.now()+1000;hold();}});
   target.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&e.isPrimary){activeListPress=press;press.start({id:e.pointerId,x:e.clientX,y:e.clientY});}});
   target.addEventListener('pointermove',e=>press.move({id:e.pointerId,x:e.clientX,y:e.clientY}));
   target.addEventListener('pointerup',e=>{if(press.end(e.pointerId)){suppressUntil=performance.now()+700;e.preventDefault();}});
   target.addEventListener('pointercancel',press.cancel);
   target.addEventListener('pointerleave',press.cancel);
  }
 }
 return {bind,hide};
}
