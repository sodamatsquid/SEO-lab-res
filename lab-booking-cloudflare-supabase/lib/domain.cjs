const KST = 9 * 60 * 60 * 1000;
const local = ms => new Date(ms + KST).toISOString().slice(0, 16);
const today = () => local(Date.now()).slice(0, 10);
class AppError extends Error {
  constructor(message, status = 400, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
function parseLocal(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new AppError('날짜와 시간을 올바르게 입력해 주세요. 예: 2026-10-13 09:30');
  const ms = Date.parse(value + ':00+09:00');
  if (!Number.isFinite(ms) || local(ms) !== value || +value.slice(0, 4) < 2000 || +value.slice(0, 4) > 2100)
    throw new AppError('2000~2100년 사이의 실제 날짜와 00:00~23:59 시간을 입력해 주세요.');
  return ms;
}
function text(value, label, max, required = true) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new AppError(`${label}을(를) 입력해 주세요.`);
  if (result.length > max) throw new AppError(`${label}은(는) ${max}자 이하로 입력해 주세요.`);
  return result;
}
function bookingInput(input) {
  const start = parseLocal(input.start), end = parseLocal(input.end);
  if (end <= start) throw new AppError('종료 날짜·시간은 시작 날짜·시간보다 늦어야 합니다.');
  if (typeof input.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(input.color)) throw new AppError('표시 색상을 선택해 주세요.');
  return { equipmentId: text(input.equipmentId, '장비', 100), start, end,
    person: text(input.person, '예약자 이름', 40), title: text(input.title, '실험 제목', 160, false),
    memo: text(input.memo, '상세 메모', 4000, false), color: input.color };
}
function equipmentInput(input) {
  const sort = Number(input.sortOrder);
  if (!Number.isInteger(sort) || sort < 1 || sort > 100000) throw new AppError('표시 순서는 1~100000 사이의 정수로 입력해 주세요.');
  if (typeof input.active !== 'boolean') throw new AppError('장비 사용 여부를 선택해 주세요.');
  return { name: text(input.name, '장비 이름', 100), category: text(input.category, '장비 종류', 50),
    sortOrder: sort, active: input.active, usageNote: text(input.usageNote, '이용 안내', 500, false) };
}
module.exports = { local, today, parseLocal, bookingInput, equipmentInput, AppError };
