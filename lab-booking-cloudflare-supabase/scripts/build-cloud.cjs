const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
function build({url,key,outDir}){
  if(!url||!key)throw Error('SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 먼저 설정하세요. 온라인전환안내.txt 참고.');
  const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Supabase 프로젝트 HTTPS URL을 사용하세요.');
  let allowed=key.startsWith('sb_publishable_');
  if(key.split('.').length===3){try{allowed=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}}
  if(!allowed)throw Error('공개 publishable key 또는 기존 anon key만 사용하세요. secret/service_role 키는 사용할 수 없습니다.');
  fs.mkdirSync(outDir,{recursive:true});
  const root=path.join(__dirname,'..','dist');
  const assets=new Map(fs.readdirSync(root).filter(name=>/\.(html|css|js|mjs)$/.test(name)).sort().map(name=>[name,fs.readFileSync(path.join(root,name),'utf8')]));
  assets.set('config.js','export const config='+JSON.stringify({storage:'supabase',supabaseUrl:parsed.origin,supabaseKey:key})+';\n');
  const version=createHash('sha256').update(JSON.stringify([...assets])).digest('hex').slice(0,12);
  for(const [name,source] of assets){
    const output=source.replace(/(["'])(\.\/[^"'?]+\.(?:js|mjs|css))(?:\?v=[^"']*)?\1/g,(_,q,file)=>q+file+'?v='+version+q);
    fs.writeFileSync(path.join(outDir,name),output);
  }
  fs.writeFileSync(path.join(outDir,'_headers'),`/*\n  Cache-Control: public, max-age=0, must-revalidate\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ${parsed.origin}; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n`);
}
if(require.main===module){
  const envFile=path.join(__dirname,'..','.env');if(fs.existsSync(envFile))process.loadEnvFile(envFile);
  try{build({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY,outDir:path.join(__dirname,'..','cloud-dist')});console.log('cloud-dist 준비 완료. 로컬 dist와 SQLite는 변경하지 않았습니다. 아직 배포하지 않았습니다.');}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={build};
