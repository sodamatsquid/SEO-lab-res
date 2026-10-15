import {config} from './config.js';
// Public RPCs only: no Auth account, session, or anonymous sign-in is needed.
async function rpc(name,data){
  try{
    const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:config.supabaseKey,'Content-Type':'application/json'},body:JSON.stringify(data)});
    let result;try{result=await response.json();}catch{throw Error('온라인 저장소의 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.');}
    if(!response.ok){
      if(name==='lab_export_bookings_v2'&&['PGRST202','42501'].includes(result.code))throw Error('장비 종류별 다운로드 설정이 필요합니다. Supabase SQL Editor에서 06_export_categories.sql을 한 번 실행해 주세요.');
      if(result.code==='P0001')throw Error(result.message);
      if(result.code==='42501')throw Error('공개 예약 설정이 아직 적용되지 않았습니다. Supabase에서 03_public_access.sql을 실행해 주세요.');
      if(response.status===401)throw Error('온라인 저장소 연결 설정을 확인해 주세요. Supabase URL과 공개 키가 필요합니다.');
      if(result.code==='PGRST202')throw Error('예약 저장 기능을 찾지 못했습니다. Supabase SQL 설정을 확인해 주세요.');
      throw Error('저장하지 못했습니다. 필수 항목과 시간·장비 설정을 확인해 주세요.');
    }
    return result;
  }catch(e){if(e instanceof TypeError)throw Error('온라인 저장소에 연결할 수 없습니다. 인터넷 연결과 Supabase 상태를 확인해 주세요.');throw e;}
}
export const supabaseApi={
  online:true,publicAccess:true,
  exportBookings:filters=>rpc('lab_export_bookings_v2',{p_from:filters.from,p_to:filters.to,p_person:filters.person,p_equipment_id:filters.equipmentId,p_include_cancelled:filters.includeCancelled,p_category:filters.category||''}),
  state:day=>rpc('lab_state',{p_day:day}),
  saveBooking:(data,id)=>rpc('lab_save_booking',{p_data:data,p_id:id||null}),
  cancelBooking:(id,version)=>rpc('lab_cancel_booking',{p_id:id,p_version:version}),
  saveEquipment:(data,id)=>rpc('lab_save_equipment',{p_data:data,p_id:id||null}),
  reorder:ids=>rpc('lab_reorder_equipment',{p_ids:ids})
};
