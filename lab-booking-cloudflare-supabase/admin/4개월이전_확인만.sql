-- Supabase SQL Editor에서 프로젝트 소유자가 실행하는 조회 전용 도구입니다.
-- 자동 삭제를 예약하지 않으며, 어떤 행도 수정하거나 삭제하지 않습니다.
-- 기준: Asia/Seoul 오늘 00:00에서 달력상 4개월 전. 종료 시점이 기준보다 빠른 예약만.
-- 진행 중·미래 예약 및 경계 시각에 정확히 종료된 예약은 포함하지 않습니다.
with cutoff as (
 select ((now() at time zone 'Asia/Seoul')::date - interval '4 months') at time zone 'Asia/Seoul' as at
)
select c.at at time zone 'Asia/Seoul' as "정리 기준 한국시간",
 count(b.id) as "4개월 이전 예약 건수",
 min(b.end_at) at time zone 'Asia/Seoul' as "가장 오래된 종료 시각",
 max(b.end_at) at time zone 'Asia/Seoul' as "가장 최근 종료 시각"
from cutoff c left join public.lab_bookings b on b.end_at<c.at group by c.at;

-- 아래 결과는 정리 대상 목록입니다. 상태가 cancelled인 취소 예약도 포함합니다.
with cutoff as (
 select ((now() at time zone 'Asia/Seoul')::date - interval '4 months') at time zone 'Asia/Seoul' as at
)
select b.id as "예약 ID",e.name as "장비",b.person as "예약자",b.title as "실험 조건",
 b.start_at at time zone 'Asia/Seoul' as "시작 한국시간",
 b.end_at at time zone 'Asia/Seoul' as "종료 한국시간",b.memo as "메모",b.status as "상태"
from public.lab_bookings b join public.lab_equipment e on e.id=b.equipment_id,cutoff c
where b.end_at<c.at order by b.end_at,b.id;
