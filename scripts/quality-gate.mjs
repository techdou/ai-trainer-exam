import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const walk=(d)=>fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const sourceFiles=walk('src').filter(f=>/\.(ts|tsx)$/.test(f));
const failures=[]; const pass=[];
function check(name,condition,detail){(condition?pass:failures).push({name,detail});}
const all=sourceFiles.map(read).join('\n');
check('no localStorage auth',!sourceFiles.some(f=>/(?:window\.)?localStorage\./.test(read(f))),'认证只使用统一 sessionStorage 会话');
check('no double JSON body',!sourceFiles.some(f=>/apiFetch[\s\S]{0,300}body\s*:\s*JSON\.stringify/.test(read(f))),'apiFetch body 由客户端统一序列化');
check('no client graderId submission',!walk('src/app').filter(f=>/\.(ts|tsx)$/.test(f)).some(f=>/body\s*:\s*\{[^}]*graderId/s.test(read(f))),'评分器由服务端任务类型绑定');
check('exam no practice fallback',!walk('src/app/api/student/exams').filter(f=>f.endsWith('.ts')).some(f=>read(f).includes('practice_question_items')),'正式考试不读取练习库');
check('transactional submit',read('src/app/api/student/exams/submit/route.ts').includes('dbTx')&&read('src/app/api/student/exams/submit/route.ts').includes('FOR UPDATE'),'交卷事务+行锁');
check('practice lock guard',walk('src/app/api/student/practice').filter(f=>f.endsWith('.ts')).every(f=>!read(f).includes('export')||read(f).includes('assertPracticeUnlocked')||f.endsWith('/route.ts')&&['wrong'].some(x=>f.includes(x))),'练习核心接口服务端锁定');
check('server deadline',read('src/app/api/student/exams/start/route.ts').includes('server_deadline')&&read('src/app/student/exams/[scheduleId]/page.tsx').includes('serverDeadline'),'截止时间来自服务端');
check('no hardcoded seed passwords',!walk('scripts/db').filter(f=>f.endsWith('.mts')).some(f=>/Password\s*=\s*['"][^'"]+['"]|password:\s*['"](?:admin|123|student)/i.test(read(f))),'种子账号无固定明文密码');
check('RLS migration',/ROW LEVEL SECURITY/i.test(read('drizzle/0002_production_hardening.sql')),'生产加固迁移启用 RLS');
check('CI workflow',fs.existsSync(path.join(root,'.github/workflows/ci.yml')),'GitHub Actions 质量门禁');
check('production docs',['docs/ARCHITECTURE.md','docs/DEPLOYMENT.md','docs/SECURITY.md','docs/TEST_REPORT.md'].every(f=>fs.existsSync(path.join(root,f))),'生产文档齐全');
console.log(JSON.stringify({passed:pass.length,failed:failures.length,pass,failures},null,2));
if(failures.length)process.exit(1);
