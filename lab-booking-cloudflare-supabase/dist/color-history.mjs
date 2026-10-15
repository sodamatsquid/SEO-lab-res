export const COLOR_KEY='lab-booking.my-colors.v1';
export const DEFAULT_COLOR='#cfb8ed';
export function createColorHistory(storage){
 let memory=[],sessionOnly=false;
 const clean=data=>[...new Set((Array.isArray(data)?data:[]).filter(c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c)).map(c=>c.toLowerCase()))].slice(0,5);
 function read(){if(!sessionOnly)try{const raw=storage?.getItem(COLOR_KEY);if(raw)memory=clean(JSON.parse(raw));else if(storage)memory=[];}catch{}return [...memory];}
 function write(data){memory=clean(data);try{storage?.setItem(COLOR_KEY,JSON.stringify(memory));}catch{sessionOnly=true;}return [...memory];}
 return {read,latest:()=>read()[0]||DEFAULT_COLOR,remember(color){return /^#[0-9a-f]{6}$/i.test(color)?write([color,...read()]):read();},clear:()=>write([])};
}
