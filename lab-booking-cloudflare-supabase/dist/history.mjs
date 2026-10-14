// These suggestions belong only to this browser. Never seed them from shared bookings.
export const HISTORY_KEY='lab-booking.my-inputs.v1';
export function createHistory(storage){
  let memory={people:[],titles:[]},sessionOnly=false;
  const clean=data=>Object.fromEntries(['people','titles'].map(key=>[key,[...new Set((Array.isArray(data?.[key])?data[key]:[]).filter(x=>typeof x==='string').map(x=>x.trim()).filter(x=>x&&x.length<=(key==='people'?40:160)))].slice(0,5)]));
  function read(){if(!sessionOnly)try{const raw=storage?.getItem(HISTORY_KEY);if(raw)memory=clean(JSON.parse(raw));else if(storage)memory={people:[],titles:[]};}catch{}return clean(memory);}
  function write(data){memory=clean(data);try{storage?.setItem(HISTORY_KEY,JSON.stringify(memory));}catch{sessionOnly=true;}return clean(memory);}
  return {read,remember(key,value){const data=read();value=value.trim();if(value)data[key]=[value,...data[key].filter(x=>x!==value)];return write(data);},remove(key,value){const data=read();data[key]=data[key].filter(x=>x!==value);return write(data);}};
}
export function retentionCutoff(day){
  const [year,month,date]=day.split('-').map(Number),target=new Date(Date.UTC(year,month-5,1));
  const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(date,last));return target.toISOString().slice(0,10);
}
