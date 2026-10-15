-- 다운로드 창의 이름 선택용 읽기 전용 조회입니다.
-- 기존 예약/회원/자동 정리 설정은 변경하지 않습니다. 반복 실행해도 됩니다.
begin;
create or replace function public.lab_export_people(
  p_from date,p_to date,p_equipment_id text default '',p_include_cancelled boolean default false,p_category text default ''
) returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare names jsonb;
begin
  if p_from is null or p_to is null or p_from<'2000-01-01'::date or p_to>'2100-12-31'::date or p_to<p_from then
    raise exception '시작·종료 날짜를 올바르게 선택해 주세요.';
  end if;
  if p_to-p_from>=366 then raise exception '한 번에 최대 366일까지 이름을 조회할 수 있습니다.'; end if;
  if length(coalesce(p_equipment_id,''))>100 or length(coalesce(p_category,''))>50 then raise exception '검색 조건이 너무 깁니다.'; end if;
  select coalesce(jsonb_agg(q.person order by q.person),'[]'::jsonb) into names from (
    select distinct b.person from public.lab_bookings b join public.lab_equipment e on e.id=b.equipment_id
    where b.start_at<((p_to+1)::timestamp at time zone 'Asia/Seoul') and b.end_at>(p_from::timestamp at time zone 'Asia/Seoul')
      and (coalesce(p_include_cancelled,false) or b.status='active')
      and (coalesce(p_category,'')='' or e.category=p_category)
      and (coalesce(p_equipment_id,'')='' or b.equipment_id=p_equipment_id)
  ) q;
  return names;
end $$;
revoke all on function public.lab_export_people(date,date,text,boolean,text) from public,anon,authenticated;
grant execute on function public.lab_export_people(date,date,text,boolean,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
