-- 주의: 이 파일을 실행하면 다음 예약 시각부터 오래된 예약이 실제로 영구 삭제됩니다.
-- 먼저 05_retention_function.sql을 설치하고 필요한 과거 기록을 엑셀로 내려받아 확인하세요.
-- 기준: 한국시간 오늘 00:00의 4개월 전보다 먼저 종료한 예약(취소 포함).
-- 매일 한국시간 03:05 (= UTC 18:05) 실행. 사이트/PC를 닫아도 Supabase에서 작동합니다.
-- 이 파일을 다시 실행해도 동일 이름 작업을 갱신하며 작업이 중복 등록되지 않습니다.
begin;
create extension if not exists pg_cron;
do $$begin
 if to_regprocedure('lab_private.purge_old_bookings()') is null then raise exception '05_retention_function.sql을 먼저 실행하세요.'; end if;
 if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC','Etc/UTC','Asia/Seoul') then raise exception 'Cron 시간대 설정을 확인하세요. UTC 또는 Asia/Seoul을 지원합니다.'; end if;
end $$;
select cron.schedule('lab-booking-retention-4-months',case when current_setting('cron.timezone',true)='Asia/Seoul' then '5 3 * * *' else '5 18 * * *' end,
 $job$select lab_private.purge_old_bookings();
 delete from cron.job_run_details
 where jobid=(select jobid from cron.job where jobname='lab-booking-retention-4-months')
 and end_time<now()-interval '30 days';$job$);
select cron.alter_job(job_id:=(select jobid from cron.job where jobname='lab-booking-retention-4-months'),active:=true);
commit;
select jobname,schedule,active from cron.job where jobname='lab-booking-retention-4-months';
