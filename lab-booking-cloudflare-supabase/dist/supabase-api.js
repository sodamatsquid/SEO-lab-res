import {config} from './config.js';
const KEY='lab-booking-supabase-session';
let session=null;try{session=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{}
let renewing=null;
function remember(value){session=value;if(value)sessionStorage.setItem(KEY,JSON.stringify(value));else sessionStorage.removeItem(KEY);}
async function auth(grant,data){
  const response=await fetch(config.supabaseUrl+'/auth/v1/token?grant_type='+grant,{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok)throw Error(grant==='password'?'로그인하지 못했습니다. 이메일·비밀번호와 계정 상태를 확인해 주세요.':'로그인이 만료되었습니다. 다시 로그인해 주세요.');
  remember({...result,expires_at:Math.floor(Date.now()/1000)+result.expires_in});return result;
}
async function token(){
  if(!session)throw Error('이메일과 비밀번호로 로그인해 주세요.');
  if(session.expires_at<Date.now()/1000+60){
    if(!renewing)renewing=auth('refresh_token',{refresh_token:session.refresh_token}).catch(e=>{remember(null);throw e;}).finally(()=>renewing=null);
    await renewing;
  }return session.access_token;
}
async function rpc(name,data){
  try{
    const access=await token();const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.supabaseKey,Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json();
    if(!response.ok){if(response.status===401){remember(null);throw Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');}if(result.code==='P0001')throw Error(result.message);if(result.code==='42501')throw Error('등록된 연구실 구성원만 이 기능을 사용할 수 있습니다.');throw Error('저장하지 못했습니다. 필수 항목과 시간·장비 설정을 확인해 주세요.');}
    return result;
  }catch(e){if(e instanceof TypeError)throw Error('온라인 저장소에 연결할 수 없습니다. 인터넷 연결과 Supabase 상태를 확인해 주세요.');throw e;}
}
export const supabaseApi={
  online:true,session:()=>session,
  login:(email,password)=>auth('password',{email,password}),
  logout:async()=>{const access=session?.access_token;remember(null);if(access)try{await fetch(config.supabaseUrl+'/auth/v1/logout',{method:'POST',headers:{apikey:config.supabaseKey,Authorization:'Bearer '+access}});}catch{}},
  state:day=>rpc('lab_state',{p_day:day}),
  saveBooking:(data,id)=>rpc('lab_save_booking',{p_data:data,p_id:id||null}),
  cancelBooking:(id,version)=>rpc('lab_cancel_booking',{p_id:id,p_version:version}),
  saveEquipment:(data,id)=>rpc('lab_save_equipment',{p_data:data,p_id:id||null}),
  reorder:ids=>rpc('lab_reorder_equipment',{p_ids:ids})
};
