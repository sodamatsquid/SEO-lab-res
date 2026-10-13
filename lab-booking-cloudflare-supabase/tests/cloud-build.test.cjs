const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('../scripts/build-cloud.cjs');
test('온라인 빌드 분리 및 관리자 비밀키 차단 (외부 연결 없음)',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lab-cloud-build-'));const original=fs.readFileSync(path.join(__dirname,'../dist/config.js'),'utf8');
  try{
    build({url:'https://example.supabase.co',key:'sb_publishable_TEST_ONLY',outDir:dir});
    assert.match(fs.readFileSync(path.join(dir,'config.js'),'utf8'),/"storage":"supabase"/);
    assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/authPanel/);
    assert.match(fs.readFileSync(path.join(dir,'_headers'),'utf8'),/connect-src 'self' https:\/\/example.supabase.co/);
    assert.equal(fs.readFileSync(path.join(__dirname,'../dist/config.js'),'utf8'),original);
    assert.throws(()=>build({url:'https://example.supabase.co',key:'sb_secret_test',outDir:dir}),/service_role/);
    const service=['header',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),'sig'].join('.');
    assert.throws(()=>build({url:'https://example.supabase.co',key:service,outDir:dir}),/service_role/);
    assert.throws(()=>build({url:'',key:'',outDir:dir}),/먼저 설정/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
