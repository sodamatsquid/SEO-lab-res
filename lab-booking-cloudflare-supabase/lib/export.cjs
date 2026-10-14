const {parseLocal,AppError}=require('./domain.cjs');
function exportInput(input){
  const from=String(input.from||''),to=String(input.to||'');
  const start=parseLocal(from+'T00:00'),end=parseLocal(to+'T00:00')+86400000;
  if(end<=start)throw new AppError('종료 날짜는 시작 날짜와 같거나 뒤여야 합니다.');
  if(end-start>366*86400000)throw new AppError('한 번에 최대 366일을 다운로드할 수 있습니다. 기간을 나누어 주세요.');
  const person=String(input.person||'').trim(),equipmentId=String(input.equipmentId||'');
  if(person.length>40||equipmentId.length>100)throw new AppError('검색 조건이 너무 깁니다.');
  const includeCancelled=input.includeCancelled===true||input.includeCancelled==='true';
  return {from,to,start,end,person,equipmentId,includeCancelled};
}
module.exports={exportInput};
