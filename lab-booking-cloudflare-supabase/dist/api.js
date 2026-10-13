import {config} from './config.js';
import {supabaseApi} from './supabase-api.js';
// The same UI works with local SQLite or Supabase; only configuration changes.
async function request(url,method='GET',data){
  let response;
  try{response=await fetch('/api'+url,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});}
  catch{throw Error('서버에 연결할 수 없습니다. 실행 창이 열려 있는지 확인해 주세요.');}
  let result;try{result=await response.json();}catch{throw Error('서버 응답을 읽지 못했습니다. 실행 창을 확인해 주세요.');}
  if(!response.ok)throw Error(result.error||'요청을 처리하지 못했습니다.');return result;
}
const localApi={state:day=>request('/state?date='+encodeURIComponent(day)),saveBooking:(data,id)=>request('/bookings'+(id?'/'+id:''),id?'PUT':'POST',data),cancelBooking:(id,version)=>request('/bookings/'+id,'DELETE',{version}),saveEquipment:(data,id)=>request('/equipment'+(id?'/'+id:''),id?'PUT':'POST',data),reorder:ids=>request('/equipment/reorder','POST',{ids})};
export const api=config.storage==='supabase'?supabaseApi:localApi;
