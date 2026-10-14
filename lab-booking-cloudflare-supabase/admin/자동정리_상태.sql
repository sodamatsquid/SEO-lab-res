-- pg_cron 활성화 및 05 기능 설치 후 SQL Editor에서 조회합니다. 읽기 전용입니다.
select jobname as "작업",schedule as "UTC 예약",active as "작동 중"
from cron.job where jobname='lab-booking-retention-4-months';

select ran_at at time zone 'Asia/Seoul' as "실행 한국시간",
 cutoff_at at time zone 'Asia/Seoul' as "정리 기준",deleted_count as "실제 삭제 건수"
from lab_private.retention_runs order by ran_at desc limit 30;

select status,return_message,start_time at time zone 'Asia/Seoul' as "시작 한국시간",
 end_time at time zone 'Asia/Seoul' as "완료 한국시간"
from cron.job_run_details
where jobid=(select jobid from cron.job where jobname='lab-booking-retention-4-months')
order by start_time desc limit 30;
