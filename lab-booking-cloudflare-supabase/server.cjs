const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const { AppError,today }=require('./lib/domain.cjs');
let createRepository;
try { ({createRepository}=require('./lib/repository.cjs')); }
catch(e) { console.error('Node.js 22.13 이상이 필요합니다. https://nodejs.org 에서 최신 LTS를 설치해 주세요.');throw e; }
function createApp({dbPath=path.join(__dirname,'data','lab-booking.sqlite'),seed=true}={}) {
  const repo=createRepository(dbPath,{seed});
  const root=path.join(__dirname,'dist');
  const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json')) throw new AppError('JSON 형식으로 요청해 주세요.',415);
    let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>65536)throw new AppError('입력 내용이 너무 깁니다.',413);}
    try {const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object')throw Error();return data;}catch{throw new AppError('입력 내용을 읽을 수 없습니다.');}
  }
  const server=http.createServer(async(req,res)=>{
    try {
      const host=req.headers.host;
      if(!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(host??''))throw new AppError('이 PC의 로컬 주소로만 접속할 수 있습니다.',403);
      if(req.headers.origin&&!['http://'+host].includes(req.headers.origin))throw new AppError('다른 사이트에서 보낸 요청은 허용하지 않습니다.',403);
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
      const url=new URL(req.url,'http://'+host), route=url.pathname,method=req.method;
      if(route==='/api/health')return json(res,200,{ok:true,mode:'local-sqlite',timezone:'Asia/Seoul'});
      if(route==='/api/state'&&method==='GET')return json(res,200,{equipment:repo.equipment(),bookings:repo.bookings(url.searchParams.get('date')||today()),suggestions:repo.suggestions(),today:today()});
      if(route==='/api/bookings'&&method==='POST')return json(res,201,repo.saveBooking(await body(req)));
      const booking=route.match(/^\/api\/bookings\/([\w-]+)$/);
      if(booking&&method==='PUT')return json(res,200,repo.saveBooking(await body(req),booking[1]));
      if(booking&&method==='DELETE')return json(res,200,repo.cancelBooking(booking[1],(await body(req)).version));
      if(route==='/api/equipment'&&method==='POST')return json(res,201,repo.saveEquipment(await body(req)));
      if(route==='/api/equipment/reorder'&&method==='POST')return json(res,200,repo.reorderEquipment((await body(req)).ids));
      const equipment=route.match(/^\/api\/equipment\/([\w-]+)$/);
      if(equipment&&method==='PUT')return json(res,200,repo.saveEquipment(await body(req),equipment[1]));
      if(route.startsWith('/api/'))throw new AppError('요청한 기능을 찾을 수 없습니다.',404);
      if(method!=='GET')throw new AppError('지원하지 않는 요청입니다.',405);
      const relative=decodeURIComponent(route==='/'?'/index.html':route),file=path.resolve(root,'.'+relative);
      if(!file.startsWith(root+path.sep))throw new AppError('접근할 수 없는 경로입니다.',403);
      const ext=path.extname(file),types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css'};
      if(!types[ext]||!fs.existsSync(file)||!fs.statSync(file).isFile())throw new AppError('파일을 찾을 수 없습니다.',404);
      res.writeHead(200,{'Content-Type':types[ext]+'; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
    }catch(e){if(!(e instanceof AppError))console.error(e);json(res,e.status??500,{error:e.status?e.message:'저장 중 오류가 발생했습니다. 서버 창을 확인해 주세요.',...e.extra});}
  });
  server.on('close',()=>repo.close());
  return server;
}
if(require.main===module){
  const port=Number(process.env.LAB_BOOKING_PORT||8765),server=createApp({dbPath:process.env.LAB_BOOKING_DB||undefined,seed:process.env.LAB_BOOKING_SEED!=='0'});
  server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'이미 실행 중이거나 8765번 포트를 사용 중입니다. 기존 실행 창을 확인해 주세요.':e);server.close();process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>{
    const url=`http://127.0.0.1:${server.address().port}`;
    console.log(`연구실 장비 예약 · 로컬 시험용\n접속: ${url}\n데이터: ${process.env.LAB_BOOKING_DB||path.join(__dirname,'data','lab-booking.sqlite')}\n종료: 이 창에서 Ctrl+C\n외부 공개 및 사용자 인증 없음`);
    if(process.argv.includes('--open')&&process.platform==='win32')require('node:child_process').spawn('explorer.exe',[url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();
  });
  let stopping=false;const stop=()=>{if(!stopping){stopping=true;server.close();server.closeIdleConnections();}};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
module.exports={createApp};
