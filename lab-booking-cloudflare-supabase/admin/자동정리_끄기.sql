-- 다음 자동 실행부터 중지합니다. 이미 삭제된 예약을 복원하는 기능은 아닙니다.
select cron.alter_job(job_id:=jobid,active:=false)
from cron.job where jobname='lab-booking-retention-4-months';
select jobname,schedule,active from cron.job where jobname='lab-booking-retention-4-months';
