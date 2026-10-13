export const DAY=86400000;
export const toMs=value=>Date.parse(value+':00+09:00');
export const local=ms=>new Date(ms+9*3600000).toISOString().slice(0,16);
export const today=()=>local(Date.now()).slice(0,10);
export const shiftDay=(day,n)=>local(toMs(day+'T00:00')+n*DAY).slice(0,10);
export const minuteLabel=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function dateTime(day,time){
  const raw=time.trim();let h,m;
  if(/^\d{4}$/.test(raw)){h=+raw.slice(0,2);m=+raw.slice(2);}else if(/^\d{1,2}:\d{2}$/.test(raw)){[h,m]=raw.split(':').map(Number);}else throw Error('시간은 09:30 또는 0930처럼 입력해 주세요.');
  if(h>24||m>59||(h===24&&m!==0))throw Error('시간은 00:00~24:00 사이로 입력해 주세요.');
  const base=toMs(day+'T00:00');
  if(!Number.isFinite(base)||local(base).slice(0,10)!==day)throw Error('실제 날짜를 선택해 주세요.');
  return local(base+(h*60+m)*60000);
}
export function clipBooking(booking,day){
  const base=toMs(day+'T00:00'),start=toMs(booking.start),end=toMs(booking.end);
  if(start>=base+DAY||end<=base)return null;
  return {start:Math.max(0,(start-base)/60000),end:Math.min(1440,(end-base)/60000),before:start<base,after:end>base+DAY};
}
export function textColor(hex){
  const rgb=hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];return l>.179?'#17121d':'#ffffff';
}
export const fullTime=value=>value.replace('T',' ');
