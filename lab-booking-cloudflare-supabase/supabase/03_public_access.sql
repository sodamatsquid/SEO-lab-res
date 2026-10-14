-- 로그인 없는 공동 예약으로 전환합니다. 기존 장비·예약·계정은 삭제하지 않습니다.
-- 기존 사이트: 이 파일만 SQL Editor에서 실행합니다. 반복 실행할 수 있습니다.
-- 새 프로젝트: 01_schema.sql → 02_initial_equipment.sql → 이 파일 순서입니다.
-- 모든 방문자가 모든 예약 및 장비를 관리할 수 있습니다.
begin;

alter table public.lab_bookings alter column owner_id drop not null;
alter table public.lab_bookings alter column owner_id drop default;

-- 테이블 직접 접근은 닫고, 검증하는 다섯 개 RPC만 공개합니다.
alter table public.lab_bookings enable row level security;
alter table public.lab_equipment enable row level security;
alter table public.lab_members enable row level security;
revoke all on public.lab_bookings,public.lab_equipment,public.lab_members from public,anon,authenticated;

create or replace function public.lab_guard_booking() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.owner_id is distinct from old.owner_id or new.id is distinct from old.id then
      raise exception '예약 소유자와 식별자는 변경할 수 없습니다.';
    end if;
    new.version:=old.version+1; new.created_at:=old.created_at;
  else new.version:=1; end if;
  if new.status='active' and not exists(select 1 from public.lab_equipment where id=new.equipment_id and active) then
    if TG_OP='INSERT' then raise exception '사용 중지된 장비에는 새 예약을 등록할 수 없습니다.';
    elsif new.equipment_id<>old.equipment_id then raise exception '사용 중지된 장비에는 새 예약을 등록할 수 없습니다.'; end if;
  end if;
  new.updated_at:=now(); return new;
end $$;

-- 과거 예약의 owner_id는 DB에 보존하지만 공개 응답에 계정 ID를 담지 않습니다.
create or replace function public.lab_booking_json(b public.lab_bookings) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',b.id,'equipmentId',b.equipment_id,
    'start',to_char(b.start_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI'),
    'end',to_char(b.end_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI'),
    'person',b.person,'title',b.title,'color',b.color,'memo',b.memo,'version',b.version,'status',b.status);
$$;

create or replace function public.lab_state(p_day date) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_day is null or p_day<'2000-01-01'::date or p_day>'2100-12-31'::date then
    raise exception '예약 날짜는 2000년부터 2100년 사이로 선택해 주세요.';
  end if;
  return jsonb_build_object(
    'publicAccess',true,'admin',true,
    'suggestions',jsonb_build_object(
      'people',(select coalesce(jsonb_agg(person),'[]') from (select person from public.lab_bookings where person<>'' group by person order by max(updated_at) desc limit 50) p),
      'titles',(select coalesce(jsonb_agg(title),'[]') from (select title from public.lab_bookings where title<>'' group by title order by max(updated_at) desc limit 50) t)),
    'today',to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'),
    'equipment',(select coalesce(jsonb_agg(public.lab_equipment_json(e) order by sort_order,id),'[]') from public.lab_equipment e),
    'bookings',(select coalesce(jsonb_agg(public.lab_booking_json(b) order by start_at),'[]') from public.lab_bookings b where status='active' and start_at<((p_day+1)::timestamp at time zone 'Asia/Seoul') and end_at>(p_day::timestamp at time zone 'Asia/Seoul'))
  );
end $$;

create or replace function public.lab_save_booking(p_data jsonb,p_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare s timestamptz; e timestamptz; b public.lab_bookings; conflict public.lab_bookings;
begin
  if coalesce(btrim(p_data->>'equipmentId'),'')='' then raise exception '장비를 선택해 주세요.'; end if;
  if length(coalesce(btrim(p_data->>'person'),'')) not between 1 and 40 then raise exception '예약자 이름을 1~40자로 입력해 주세요.'; end if;
  if coalesce(p_data->>'start','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or coalesce(p_data->>'end','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception '날짜와 시간을 올바르게 입력해 주세요.'; end if;
  s:=((p_data->>'start')||':00+09:00')::timestamptz; e:=((p_data->>'end')||':00+09:00')::timestamptz;
  if e<=s then raise exception '종료 날짜·시간은 시작보다 늦어야 합니다.'; end if;
  if p_id is null then
    insert into public.lab_bookings(equipment_id,owner_id,start_at,end_at,person,title,color,memo)
      values(p_data->>'equipmentId',null,s,e,btrim(p_data->>'person'),coalesce(btrim(p_data->>'title'),''),p_data->>'color',coalesce(p_data->>'memo','')) returning * into b;
  else
    update public.lab_bookings set equipment_id=p_data->>'equipmentId',start_at=s,end_at=e,person=btrim(p_data->>'person'),title=coalesce(btrim(p_data->>'title'),''),color=p_data->>'color',memo=coalesce(p_data->>'memo','')
      where id=p_id and status='active' and version=(p_data->>'version')::integer returning * into b;
    if not found then raise exception '예약이 변경되거나 취소되었습니다. 새로고침한 뒤 다시 시도해 주세요.'; end if;
  end if;
  return public.lab_booking_json(b);
exception when exclusion_violation then
  select * into conflict from public.lab_bookings where status='active' and equipment_id=p_data->>'equipmentId' and (p_id is null or id<>p_id) and start_at<e and end_at>s order by start_at limit 1;
  raise exception '예약 시간이 겹칩니다: % ~ % (% · %)',to_char(conflict.start_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),to_char(conflict.end_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),conflict.person,conflict.title;
end $$;

create or replace function public.lab_cancel_booking(p_id uuid,p_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  update public.lab_bookings set status='cancelled' where id=p_id and version=p_version and status='active';
  if not found then raise exception '예약이 변경되거나 취소되었습니다. 새로고침한 뒤 다시 시도해 주세요.'; end if;
  return '{"cancelled":true}'::jsonb;
end $$;

create or replace function public.lab_save_equipment(p_data jsonb,p_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.lab_equipment;
begin
  if p_id is null then
    insert into public.lab_equipment(name,category,sort_order,active,usage_note) values(btrim(p_data->>'name'),btrim(p_data->>'category'),(p_data->>'sortOrder')::integer,(p_data->>'active')::boolean,coalesce(p_data->>'usageNote','')) returning * into e;
  else
    update public.lab_equipment set name=btrim(p_data->>'name'),category=btrim(p_data->>'category'),sort_order=(p_data->>'sortOrder')::integer,active=(p_data->>'active')::boolean,usage_note=coalesce(p_data->>'usageNote','') where id=p_id returning * into e;
    if not found then raise exception '장비를 찾을 수 없습니다.'; end if;
  end if;
  return public.lab_equipment_json(e);
exception when unique_violation then raise exception '같은 이름의 장비가 있습니다.';
end $$;

create or replace function public.lab_reorder_equipment(p_ids jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare total integer;
begin
  lock table public.lab_equipment in share row exclusive mode;
  select count(*) into total from public.lab_equipment;
  if jsonb_typeof(p_ids) is distinct from 'array' then raise exception '장비 순서 목록을 확인해 주세요.'; end if;
  if jsonb_array_length(p_ids)<>total or (select count(distinct x.id) from jsonb_array_elements_text(p_ids) as x(id) join public.lab_equipment e on e.id=x.id)<>total then raise exception '장비 목록이 변경되었습니다. 다시 불러와 주세요.'; end if;
  update public.lab_equipment e set sort_order=x.n from (select id,ordinality::integer n from jsonb_array_elements_text(p_ids) with ordinality as t(id,ordinality)) x where e.id=x.id;
  return (select coalesce(jsonb_agg(public.lab_equipment_json(e) order by sort_order),'[]') from public.lab_equipment e);
end $$;

revoke all on function public.lab_guard_booking(),public.lab_booking_json(public.lab_bookings),public.lab_equipment_json(public.lab_equipment),public.lab_is_member(),public.lab_is_admin() from public,anon,authenticated;
revoke all on function public.lab_state(date),public.lab_save_booking(jsonb,uuid),public.lab_cancel_booking(uuid,integer),public.lab_save_equipment(jsonb,text),public.lab_reorder_equipment(jsonb) from public,anon,authenticated;
grant usage on schema public to anon,authenticated;
grant execute on function public.lab_state(date),public.lab_save_booking(jsonb,uuid),public.lab_cancel_booking(uuid,integer),public.lab_save_equipment(jsonb,text),public.lab_reorder_equipment(jsonb) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
