-- Fresh dedicated Supabase project only. Run once in the SQL Editor.
-- No anonymous access. Membership is assigned by the project owner.
begin;
create extension if not exists btree_gist with schema extensions;
set local search_path=public,extensions;
create table public.lab_members(
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('member','admin')),
  enabled boolean not null default true
);
alter table public.lab_members enable row level security;
revoke all on public.lab_members from anon,authenticated;
create function public.lab_is_member() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.lab_members where user_id=auth.uid() and enabled);
$$;
create function public.lab_is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.lab_members where user_id=auth.uid() and enabled and role='admin');
$$;
revoke all on function public.lab_is_member(),public.lab_is_admin() from public,anon;
grant execute on function public.lab_is_member(),public.lab_is_admin() to authenticated;

create table public.lab_equipment(
  id text primary key default gen_random_uuid()::text,
  name text not null check(length(btrim(name)) between 1 and 100),
  category text not null check(length(btrim(category)) between 1 and 50),
  sort_order integer not null check(sort_order between 1 and 100000),
  active boolean not null default true,
  usage_note text not null default '' check(length(usage_note)<=500)
);
create unique index lab_equipment_name on public.lab_equipment(lower(name));
create table public.lab_bookings(
  id uuid primary key default gen_random_uuid(),
  equipment_id text not null references public.lab_equipment(id),
  owner_id uuid not null default auth.uid() references auth.users(id),
  start_at timestamptz not null, end_at timestamptz not null,
  person text not null check(length(btrim(person)) between 1 and 40),
  title text not null default '' check(length(title)<=160),
  color text not null check(color ~ '^#[0-9a-fA-F]{6}$'),
  memo text not null default '' check(length(memo)<=4000),
  status text not null default 'active' check(status in ('active','cancelled')),
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(end_at>start_at),
  check(start_at>='2000-01-01T00:00:00+09'::timestamptz and end_at<'2101-01-01T00:00:00+09'::timestamptz),
  constraint lab_no_overlap exclude using gist(equipment_id with =,tstzrange(start_at,end_at,'[)') with &&) where(status='active')
);
alter table public.lab_equipment enable row level security;
alter table public.lab_bookings enable row level security;
revoke all on public.lab_equipment,public.lab_bookings from anon,authenticated;
grant select,insert,update on public.lab_equipment,public.lab_bookings to authenticated;
create policy equipment_read on public.lab_equipment for select to authenticated using(public.lab_is_member());
create policy equipment_insert on public.lab_equipment for insert to authenticated with check(public.lab_is_admin());
create policy equipment_update on public.lab_equipment for update to authenticated using(public.lab_is_admin()) with check(public.lab_is_admin());
create policy bookings_read on public.lab_bookings for select to authenticated using(public.lab_is_member());
create policy bookings_insert on public.lab_bookings for insert to authenticated with check(public.lab_is_member() and owner_id=auth.uid());
create policy bookings_update on public.lab_bookings for update to authenticated using(public.lab_is_member() and (owner_id=auth.uid() or public.lab_is_admin())) with check(public.lab_is_member() and (owner_id=auth.uid() or public.lab_is_admin()));

create function public.lab_guard_booking() returns trigger language plpgsql set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.owner_id<>old.owner_id or new.id<>old.id then raise exception '예약 소유자와 식별자는 변경할 수 없습니다.'; end if;
    new.version:=old.version+1; new.created_at:=old.created_at;
  else new.version:=1; end if;
  if new.status='active' and not exists(select 1 from public.lab_equipment where id=new.equipment_id and active) then
    if TG_OP='INSERT' then raise exception '사용 중지된 장비에는 새 예약을 등록할 수 없습니다.';
    elsif new.equipment_id<>old.equipment_id then raise exception '사용 중지된 장비에는 새 예약을 등록할 수 없습니다.'; end if;
  end if;
  new.updated_at:=now(); return new;
end $$;
create trigger lab_guard_booking before insert or update on public.lab_bookings for each row execute function public.lab_guard_booking();
create function public.lab_booking_json(b public.lab_bookings) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',b.id,'equipmentId',b.equipment_id,'ownerId',b.owner_id,
  'start',to_char(b.start_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI'),
  'end',to_char(b.end_at at time zone 'Asia/Seoul','YYYY-MM-DD"T"HH24:MI'),
  'person',b.person,'title',b.title,'color',b.color,'memo',b.memo,'version',b.version,'status',b.status);
$$;
create function public.lab_equipment_json(e public.lab_equipment) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',e.id,'name',e.name,'category',e.category,'sortOrder',e.sort_order,'active',e.active,'usageNote',e.usage_note);
$$;
create function public.lab_state(p_day date) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  if not public.lab_is_member() then raise exception '연구실 계정 등록이 필요합니다. 관리자에게 문의해 주세요.'; end if;
  return jsonb_build_object(
    'userId',auth.uid(),'admin',public.lab_is_admin(),
    'suggestions',jsonb_build_object(
      'people',(select coalesce(jsonb_agg(person),'[]') from (select person from public.lab_bookings where owner_id=auth.uid() and person<>'' group by person order by max(updated_at) desc limit 50) p),
      'titles',(select coalesce(jsonb_agg(title),'[]') from (select title from public.lab_bookings where owner_id=auth.uid() and title<>'' group by title order by max(updated_at) desc limit 50) t)),
    'today',to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD'),
    'equipment',(select coalesce(jsonb_agg(public.lab_equipment_json(e) order by sort_order,id),'[]') from public.lab_equipment e),
    'bookings',(select coalesce(jsonb_agg(public.lab_booking_json(b) order by start_at),'[]') from public.lab_bookings b where status='active' and start_at<((p_day+1)::timestamp at time zone 'Asia/Seoul') and end_at>(p_day::timestamp at time zone 'Asia/Seoul'))
  );
end $$;
create function public.lab_save_booking(p_data jsonb,p_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s timestamptz; e timestamptz; b public.lab_bookings; conflict public.lab_bookings;
begin
  if not public.lab_is_member() then raise exception '등록된 연구실 구성원만 예약할 수 있습니다.'; end if;
  if coalesce(p_data->>'start','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' or coalesce(p_data->>'end','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception '날짜와 시간을 올바르게 입력해 주세요.'; end if;
  s:=((p_data->>'start')||':00+09:00')::timestamptz;e:=((p_data->>'end')||':00+09:00')::timestamptz;
  if e<=s then raise exception '종료 날짜·시간은 시작보다 늦어야 합니다.'; end if;
  if p_id is null then
    insert into public.lab_bookings(equipment_id,start_at,end_at,person,title,color,memo) values(p_data->>'equipmentId',s,e,btrim(p_data->>'person'),coalesce(btrim(p_data->>'title'),''),p_data->>'color',coalesce(p_data->>'memo','')) returning * into b;
  else
    update public.lab_bookings set equipment_id=p_data->>'equipmentId',start_at=s,end_at=e,person=btrim(p_data->>'person'),title=coalesce(btrim(p_data->>'title'),''),color=p_data->>'color',memo=coalesce(p_data->>'memo','') where id=p_id and status='active' and version=(p_data->>'version')::integer returning * into b;
    if not found then raise exception '수정 권한이 없거나 예약이 변경되었습니다. 다시 불러와 주세요.'; end if;
  end if;
  return public.lab_booking_json(b);
exception when exclusion_violation then
  select * into conflict from public.lab_bookings where status='active' and equipment_id=p_data->>'equipmentId' and (p_id is null or id<>p_id) and start_at<e and end_at>s order by start_at limit 1;
  raise exception '예약 시간이 겹칩니다: % ~ % (% · %)',to_char(conflict.start_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),to_char(conflict.end_at at time zone 'Asia/Seoul','YYYY-MM-DD HH24:MI'),conflict.person,conflict.title;
end $$;
create function public.lab_cancel_booking(p_id uuid,p_version integer) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
  update public.lab_bookings set status='cancelled' where id=p_id and version=p_version and status='active';
  if not found then raise exception '취소 권한이 없거나 예약이 변경되었습니다. 다시 불러와 주세요.'; end if;
  return '{"cancelled":true}'::jsonb;
end $$;
create function public.lab_save_equipment(p_data jsonb,p_id text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.lab_equipment;
begin
  if not public.lab_is_admin() then raise exception '장비 관리는 관리자만 가능합니다.'; end if;
  if p_id is null then
    insert into public.lab_equipment(name,category,sort_order,active,usage_note) values(btrim(p_data->>'name'),btrim(p_data->>'category'),(p_data->>'sortOrder')::integer,(p_data->>'active')::boolean,coalesce(p_data->>'usageNote','')) returning * into e;
  else
    update public.lab_equipment set name=btrim(p_data->>'name'),category=btrim(p_data->>'category'),sort_order=(p_data->>'sortOrder')::integer,active=(p_data->>'active')::boolean,usage_note=coalesce(p_data->>'usageNote','') where id=p_id returning * into e;
    if not found then raise exception '장비를 찾을 수 없습니다.'; end if;
  end if;return public.lab_equipment_json(e);
exception when unique_violation then raise exception '같은 이름의 장비가 있습니다.';
end $$;
create function public.lab_reorder_equipment(p_ids jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
  if not public.lab_is_admin() then raise exception '장비 관리는 관리자만 가능합니다.'; end if;
  lock table public.lab_equipment in share row exclusive mode;
  select count(*) into total from public.lab_equipment;
  if jsonb_array_length(p_ids)<>total or (select count(distinct x.id) from jsonb_array_elements_text(p_ids) as x(id) join public.lab_equipment e on e.id=x.id)<>total then raise exception '장비 목록이 변경되었습니다. 다시 불러와 주세요.'; end if;
  update public.lab_equipment e set sort_order=x.n from (select id,ordinality::integer n from jsonb_array_elements_text(p_ids) with ordinality as t(id,ordinality)) x where e.id=x.id;
  return (select coalesce(jsonb_agg(public.lab_equipment_json(e) order by sort_order),'[]') from public.lab_equipment e);
end $$;
revoke all on function public.lab_guard_booking(),public.lab_booking_json(public.lab_bookings),public.lab_equipment_json(public.lab_equipment),public.lab_state(date),public.lab_save_booking(jsonb,uuid),public.lab_cancel_booking(uuid,integer),public.lab_save_equipment(jsonb,text),public.lab_reorder_equipment(jsonb) from public,anon;
grant execute on function public.lab_booking_json(public.lab_bookings),public.lab_equipment_json(public.lab_equipment),public.lab_state(date),public.lab_save_booking(jsonb,uuid),public.lab_cancel_booking(uuid,integer),public.lab_save_equipment(jsonb,text),public.lab_reorder_equipment(jsonb) to authenticated;
commit;
