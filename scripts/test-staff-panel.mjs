import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import { parseStaffDirectory, syncDirectoryParticipantsQuery, revokeDirectoryOperatorsQuery } from '../lib/attendance-staff-data.ts';
import { attendanceOperatorListQuery, operatorCanScan } from '../lib/attendance-operator-list.ts';
import ts from 'typescript';
import { isAuthorizedCoordinator } from '../lib/attendance-rules.ts';

async function loadServerModule(path, dependencies, globals = {}) {
  const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>{
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  },console:{error:()=>{}},URL,AbortSignal,setTimeout:fn=>{fn();return 1;},...globals});
  return exports;
}

// Server action rejects unauthorized callers before any Google or DB work.
let actor='participant@alumnos.udg.mx', syncCalls=0, sqlCalls=0;
const actions=await loadServerModule('../app/administracion/asistencia/actions.ts',{
  'next/cache':{revalidatePath:()=>{}}, '@/auth':{auth:async()=>({user:{email:actor}})},
  '@/lib/db':{getSql:()=>{sqlCalls++;return {}; }},
  '@/lib/attendance':{isAttendanceAdmin:email=>isAuthorizedCoordinator(email,'cdquim@cucei.udg.mx,jorge.lopezarce@academicos.udg.mx')},
  '@/lib/attendance-simulations':{},
  '@/lib/attendance-staff-sync':{syncAttendanceStaff:async()=>{syncCalls++;return{total:9,updated:8,pending:1,revoked:0};}},
});
const form=new FormData(); form.set('operation','staff-sync');
assert.equal((await actions.manageAttendance({},form)).ok,false);
assert.equal(sqlCalls,0); assert.equal(syncCalls,0);
for (const email of ['cdquim@cucei.udg.mx','jorge.lopezarce@academicos.udg.mx']) {
  actor=email; assert.equal((await actions.manageAttendance({},form)).ok,true);
}
assert.equal(syncCalls,2);

let networkCalls=0, transactions=0, failNetwork=false, malformed=false;
const sample={email:'a@alumnos.udg.mx',name:'A',active:true,id:'EQ26-0000000001',status:'Confirmado',role:'Staff',staffType:'Alumno',staffFunction:'Registro de asistencia'};
const server=await loadServerModule('../lib/attendance-staff-sync.ts',{
  'server-only':{}, '@/lib/db':{getSql:()=>({query:(text,params)=>({text,params}),transaction:async statements=>{
    transactions++; assert.equal(statements.length,5);
    assert.match(statements[0].text,/advisory/);
    assert.match(statements[4].text,/staff_sync_snapshot/);
    return [[],[],[{email:sample.email}],[],[]];
  }})},
  './attendance-staff-data':{parseStaffDirectory,syncDirectoryParticipantsQuery,revokeDirectoryOperatorsQuery},
},{process:{env:{REGISTRATION_API_URL:'https://script.google.com/macros/s/test/exec',REGISTRATION_API_SECRET:'fake-test-secret'}},fetch:async(_,options)=>{
  networkCalls++; assert.equal(JSON.parse(options.body).action,'listStaffRegistrations');
  if (failNetwork) throw new TypeError('offline');
  return new Response(malformed?'<html>not json</html>':JSON.stringify({ok:true,staff:[sample]}));
}});
assert.equal((await server.syncAttendanceStaff('coordinator')).updated,1);
assert.equal(networkCalls,1); assert.equal(transactions,1);
malformed=true;
await assert.rejects(server.syncAttendanceStaff('coordinator'));
assert.equal(transactions,1,'Bad response cannot replace last snapshot');
malformed=false; failNetwork=true; networkCalls=0;
await assert.rejects(server.syncAttendanceStaff('coordinator'));
assert.equal(networkCalls,3); assert.equal(transactions,1,'No writes when network fails');

const db = new PGlite();
try {
  for (const file of ['schema.sql','attendance.sql','attendance-auditorium.sql']) await db.exec(await readFile(new URL(`../database/${file}`, import.meta.url),'utf8'));
  const context = vm.createContext({});
  vm.runInContext(await readFile(new URL('../google-apps-script/Code.gs',import.meta.url),'utf8'),context);
  const staffRows = [['email','name','active','staffType','staffFunction'],
    ['a@alumnos.udg.mx','Operator A','SI','Alumno','Registro de asistencia'],
    ['pending@alumnos.udg.mx','Pending','si','Alumno','Registro de asistencia'],
    ['support@academicos.udg.mx','Support','si','Académico','Apoyo operativo']];
  const regRows = [['id'], ['EQ26-0000000001','','','a@alumnos.udg.mx','','Alumno','','','','Confirmado'],
    ['EQ26-0000000003','','','support@academicos.udg.mx','','Profesor','','','','Confirmado']];
  context.getSpreadsheet_ = () => ({});
  context.ensureSheet_ = (_,name) => ({getDataRange: () => ({getDisplayValues: () => name === 'Staff' ? staffRows : regRows})});
  const directory = parseStaffDirectory(JSON.parse(JSON.stringify(context.listStaffRegistrations_().staff)));
  assert.equal(directory.length,3);
  assert.equal(directory[1].id,null);
  assert.throws(() => parseStaffDirectory([]));
  assert.throws(() => parseStaffDirectory([...directory,directory[0]]));
  assert.throws(() => parseStaffDirectory([{...directory[0],active:'si'}]));
  for(const [id,email] of [['EQ26-0000000001','a@alumnos.udg.mx'],['EQ26-0000000003','support@academicos.udg.mx'],['EQ26-0000000004','other@alumnos.udg.mx']])
    await db.query(`INSERT INTO participants(id,email,name,account_type,role,institutional_code,affiliation,status,qr_token,created_at)
      VALUES($1,$2,'Test','Alumno','Alumno','code','Chemistry','Confirmado',$3,NOW())`,[id,email,`qr-${id}`]);
  const apply = async rows => {
    const data=JSON.stringify(rows);
    return db.transaction(async tx => {
      const updated=await tx.query(syncDirectoryParticipantsQuery,[data]);
      await tx.query(revokeDirectoryOperatorsQuery,[data,'coordinator']);
      await tx.query("INSERT INTO attendance_audit(actor_email,action,detail) VALUES('coordinator','staff_sync_snapshot',$1::jsonb)",[JSON.stringify({staff:rows})]);
      return updated.rows;
    });
  };
  assert.equal((await apply(directory)).length,2);
  let candidates=(await db.query(attendanceOperatorListQuery)).rows;
  assert.equal(candidates.length,2,'Support without an old grant is not a registration candidate');
  assert.equal(candidates.find(p=>p.email.startsWith('pending')).status,'Registro general pendiente');
  assert.equal(candidates.find(p=>p.email.startsWith('pending')).eligible,false);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM attendance_operators')).rows[0].count,0,'Sync never grants access');
  await db.query("INSERT INTO attendance_operators(email,active,updated_by) VALUES('a@alumnos.udg.mx',TRUE,'coordinator')");
  candidates=(await db.query(attendanceOperatorListQuery)).rows;
  assert.equal(operatorCanScan({...candidates[0], staffFunction:candidates[0].staff_function}),true);
  const canScan=async email=>(await db.query('SELECT attendance_staff_can_register($1) AS allowed',[email])).rows[0].allowed;
  assert.equal(await canScan('a@alumnos.udg.mx'),true);
  const cancelled=directory.map(s=>s.email==='a@alumnos.udg.mx'?{...s,active:false,staffType:'',staffFunction:''}:s);
  await apply(cancelled);
  assert.equal(await canScan('a@alumnos.udg.mx'),false);
  assert.equal((await db.query("SELECT active FROM attendance_operators WHERE email='a@alumnos.udg.mx'")).rows[0].active,false);
  await apply(directory);
  assert.equal((await db.query("SELECT active FROM attendance_operators WHERE email='a@alumnos.udg.mx'")).rows[0].active,false,'Reactivation requires coordinator approval');
  await apply(directory.map(s=>s.email==='a@alumnos.udg.mx'?{...s,staffFunction:'Apoyo operativo'}:s));
  assert.equal(await canScan('a@alumnos.udg.mx'),false);
  await apply(directory);
  await apply(directory.filter(s=>s.email!=='a@alumnos.udg.mx'));
  assert.equal(await canScan('a@alumnos.udg.mx'),false,'Removing from Sheets denies access despite stale participant classification');
  const mismatch=directory.map(s=>s.email==='a@alumnos.udg.mx'?{...s,id:'EQ26-9999999999'}:s);
  await apply(mismatch);
  assert.equal(await canScan('a@alumnos.udg.mx'),false);
  const saved=(await db.query("SELECT id,qr_token FROM participants WHERE email='a@alumnos.udg.mx'")).rows[0];
  assert.equal(saved.id,'EQ26-0000000001');
  assert.equal(saved.qr_token,'qr-EQ26-0000000001');
  assert.equal((await db.query("SELECT role FROM participants WHERE email='other@alumnos.udg.mx'")).rows[0].role,'Alumno');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM participants')).rows[0].count,3,'No pending participant is created');
  console.log('OK: Sheets -> snapshot -> candidates; pending/support/inactive/removed/mismatched users blocked; no identity or QR changes; no automatic grants. Isolated tests only.');
} finally { await db.close(); }
