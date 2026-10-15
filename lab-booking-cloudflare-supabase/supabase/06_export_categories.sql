-- 장비 종류별 조회만 추가합니다. 예약 데이터와 자동 삭제 설정은 변경하지 않습니다.
-- 기존 공개 예약(03) 버전에 적용합니다. 04/05를 다시 실행할 필요는 없습니다.
begin;
create or replace function public.lab_export_bookings_v2(
  p_from date,p_to date,p_person text default '',p_equipment_id text default '',p_include_cancelled boolean default false,p_category text default ''
) returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='15s' as $$
declare records jsonb;
begin
  if p_from is null or p_to is null or p_from<'2000-01-01'::date or p_to>'2100-12-31'::date or p_to<p_from then
    raise exception '시작·종료 날짜를 2000~2100년 범위에서 올바르게 선택해 주세요.';
  end if;
  if p_to-p_from>=366 then raise exception '한 번에 최대 366일을 다운로드할 수 있습니다. 기간을 나누어 주세요.'; end if;
  if length(coalesce(p_person,''))>40 or length(coalesce(p_equipment_id,''))>100 or length(coalesce(p_category,''))>50 then raise exception '검색 조건이 너무 깁니다.'; end if;
  select coalesce(jsonb_agg(q.item order by q.start_at,q.sort_order,q.id),'[]'::jsonb) into records from (
    select b.id,b.start_at,e.sort_order,public.lab_booking_json(b)||jsonb_build_object(
      'equipmentName',e.name,'category',e.category,'createdAt',b.created_at,'updatedAt',b.updated_at) item
    from public.lab_bookings b join public.lab_equipment e on e.id=b.equipment_id
    where b.start_at<((p_to+1)::timestamp at time zone 'Asia/Seoul') and b.end_at>(p_from::timestamp at time zone 'Asia/Seoul')
      and (coalesce(p_include_cancelled,false) or b.status='active')
      and (coalesce(p_category,'')='' or e.category=p_category)
      and (coalesce(p_equipment_id,'')='' or b.equipment_id=p_equipment_id)
      and (coalesce(btrim(p_person),'')='' or strpos(lower(b.person),lower(btrim(p_person)))>0)
    order by b.start_at,e.sort_order,b.id limit 20001
  ) q;
  if jsonb_array_length(records)>20000 then raise exception '예약이 20,000건을 넘습니다. 기간이나 장비 조건을 좁혀 주세요.'; end if;
  return jsonb_build_object('bookings',records,'generatedAt',now(),'filters',jsonb_build_object(
    'category',coalesce(p_category,''),'from',p_from,'to',p_to,'person',coalesce(btrim(p_person),''),'equipmentId',coalesce(p_equipment_id,''),'includeCancelled',coalesce(p_include_cancelled,false)));
end $$;
revoke all on function public.lab_export_bookings_v2(date,date,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.lab_export_bookings_v2(date,date,text,text,boolean,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
