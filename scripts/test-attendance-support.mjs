import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { buildSupportDay, supportReportQuery, supportVisitsQuery } from '../lib/attendance-support.ts';
import { attendanceCsvCell } from '../lib/attendance-rules.ts';

const daily = {date:'2026-10-20',venue:'Mesa de registro'};
assert.equal(buildSupportDay(daily).activityId,null);
assert.equal(buildSupportDay(daily).isSupport,true);
assert.equal(buildSupportDay(daily).id,'staff-support-2026-10-20');
for(const invalid of [{date:'2026-02-30'},{date:'2026-13-01'},{date:'0000-01-01'},{date:'20/10/2026'},{venue:' '}]) {
  assert.throws(()=>buildSupportDay({...daily,...invalid}));
}
const db=new PGlite();
try {
  for(const file of ['schema.sql','attendance.sql','attendance-auditorium.sql','attendance-support.sql']) await db.exec(await readFile(new URL(`../database/${file}`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../database/attendance-support.sql',import.meta.url),'utf8'));
  const {today,tomorrow}= (await db.query(`SELECT to_char(NOW() AT TIME ZONE 'America/Mexico_City','YYYY-MM-DD') AS today,
    to_char((NOW() AT TIME ZONE 'America/Mexico_City')+interval '1 day','YYYY-MM-DD') AS tomorrow`)).rows[0];
  const at=(time,date=today)=>`${date}T${time}:00-06:00`;
  for(const [id,role,fn] of [['op','Staff','Registro de asistencia'],['op2','Staff','Registro de asistencia'],['support','Staff','Apoyo operativo'],['student','Alumno',null],['support2','Staff','Apoyo operativo']]) {
    await db.query(`INSERT INTO participants(id,email,name,account_type,role,staff_function,institutional_code,affiliation,status,qr_token,created_at)
      VALUES($1,$2,$1,'Alumno',$3,$4,'000000000','Test','Confirmado',$5,NOW())`,[id,`${id}@example.invalid`,role,fn,`token-${id}`]);
  }
  for(const id of ['op','op2']) await db.query("INSERT INTO attendance_operators(email,updated_by) VALUES($1,'test')",[`${id}@example.invalid`]);
  const save=async(date=today,actor='jorge.lopezarce@academicos.udg.mx',venue='Mesa QA')=> {
    const s=buildSupportDay({date,venue});
    await db.query('SELECT attendance_prepare_support_day($1,$2,$3)',[date,s.venue,actor]);
    return s;
  };
  await assert.rejects(save(today,'support@example.invalid'));
  const day=await save();
  await save(); // same daily bucket, no duplicate
  assert.equal((await db.query("SELECT count(*)::int AS n FROM attendance_sessions")).rows[0].n,1);
  const future=await save(tomorrow);
  for(const s of [day,future]) for(const op of ['op','op2']) await db.query("INSERT INTO attendance_assignments VALUES($1,$2,'qa',NOW())",[s.id,`${op}@example.invalid`]);
  const scan=async(direction='entry',options={})=>(await db.query('SELECT * FROM record_attendance_v3($1,$2,$3,$4,$5,$6,false,$7)',[
    options.session??day.id,options.operator??'op@example.invalid',options.source==='manual'?options.person??'support':options.token??'token-support',
    direction,options.source??'qr',options.reason??'',options.request??randomUUID()])).rows[0];
  assert.equal((await scan('exit')).outcome,'entry_required');
  assert.equal((await scan('entry',{request:''})).outcome,'invalid_request');
  assert.equal((await scan('entry',{token:'bad'})).outcome,'invalid_qr');
  assert.equal((await scan('entry',{source:'manual'})).outcome,'reason_required');
  assert.equal((await scan('entry',{operator:'support@example.invalid'})).outcome,'forbidden');
  assert.equal((await scan('entry',{token:'token-student'})).outcome,'not_support_staff');
  assert.equal((await scan('entry',{token:'token-op'})).outcome,'not_support_staff');
  assert.equal((await scan('entry',{session:future.id})).outcome,'outside_window');
  await db.query("DELETE FROM attendance_assignments WHERE session_id=$1 AND operator_email='op2@example.invalid'",[day.id]);
  assert.equal((await scan('entry',{operator:'op2@example.invalid'})).outcome,'not_assigned');
  await db.query("INSERT INTO attendance_assignments VALUES($1,'op2@example.invalid','qa',NOW())",[day.id]);
  const entryId=randomUUID(),exitId=randomUUID();
  assert.equal((await scan('entry',{request:entryId})).outcome,'recorded');
  assert.equal((await scan('entry',{operator:'op2@example.invalid'})).outcome,'duplicate');
  assert.equal((await scan('entry',{request:entryId,token:'token-support2'})).outcome,'invalid_request');
  assert.equal((await db.query(supportReportQuery,[day.id,false])).rows[0].credited_hours,0);
  await assert.rejects(save(today,'jorge.lopezarce@academicos.udg.mx','Otra mesa'));
  await save(); // identical metadata allowed with history
  await db.query("UPDATE attendance_operators SET active=false WHERE email='op@example.invalid'");
  assert.equal((await scan('exit')).outcome,'forbidden');
  await db.query("UPDATE attendance_operators SET active=true WHERE email='op@example.invalid'");
  assert.equal((await scan('exit',{request:exitId})).outcome,'recorded');
  assert.equal((await scan('exit')).outcome,'duplicate');
  assert.equal((await scan()).outcome,'recorded','real reentry allowed');
  assert.equal((await scan('exit',{request:exitId})).outcome,'duplicate','old exit retry cannot close reentry');
  assert.equal((await scan('entry',{request:entryId})).outcome,'duplicate','old entry retry cannot create visit');
  assert.equal((await db.query("SELECT count(*)::int AS n FROM attendance_support_visits WHERE exited_at IS NULL")).rows[0].n,1);
  assert.equal((await scan('exit',{source:'manual',reason:'Pantalla dañada'})).outcome,'recorded');
  // Snapshot revocation cannot be bypassed by stale participant classification.
  const roster=['op','op2','support','support2'].map(id=>({email:`${id}@example.invalid`,id,status:'Confirmado',active:true,staffFunction:id.startsWith('op')?'Registro de asistencia':'Apoyo operativo'}));
  roster.find(s=>s.id==='support').active=false;
  await db.query("INSERT INTO attendance_audit(actor_email,action,detail) VALUES('qa','staff_sync_snapshot',$1::jsonb)",[JSON.stringify({staff:roster})]);
  assert.equal((await scan()).outcome,'not_support_staff');
  await db.query("DELETE FROM attendance_audit WHERE action='staff_sync_snapshot'");
  // Legacy endpoints cannot create incorrect single-entry evidence for support.
  await assert.rejects(db.query("SELECT * FROM record_attendance($1,'op@example.invalid','token-support','entry','qr','',false)",[day.id]));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM attendance_events')).rows[0].n,0);
  for(const sample of [
    {visits:[['08:00','08:31']],minutes:31,hours:0.5166},
    {visits:[['08:00',null]],minutes:0,hours:0},
    {visits:[['07:00','14:00']],minutes:420,hours:7},
    {visits:[['11:00','15:00']],minutes:240,hours:4},
    {visits:[['00:00','23:59']],minutes:1439,hours:23.9833},
    {visits:[['08:00','09:00'],['10:00','10:30']],minutes:90,hours:1.5},
    {visits:[['08:00','09:00'],['08:30','09:30']],minutes:90,hours:1.5},
    {visits:[['08:00','09:00'],['10:00',null]],minutes:60,hours:1},
  ]) {
    await db.exec('DELETE FROM attendance_support_requests; DELETE FROM attendance_support_visits');
    for(const [start,end] of sample.visits) await db.query(`INSERT INTO attendance_support_visits(session_id,participant_id,entered_at,exited_at,entry_operator,exit_operator,entry_source,exit_source)
      VALUES($1,'support',$2,$3,'op@example.invalid',CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE 'op2@example.invalid' END,'qr',CASE WHEN $3::timestamptz IS NULL THEN NULL ELSE 'qr' END)`,[day.id,at(start),end?at(end):null]);
    const row=(await db.query(supportReportQuery,[day.id,false])).rows[0];
    assert.equal(row.credited_minutes,sample.minutes);
    assert.equal(row.credited_hours,sample.hours);
    assert.equal(row.open_intervals,sample.visits.filter(v=>!v[1]).length);
    assert.equal((await db.query(supportVisitsQuery,[day.id,false])).rows.length,sample.visits.length);
  }
  // Run actual saveAttendanceSessions: updating public program must preserve support shifts, visits and assignments.
  const deferred={query:(text,params)=>({text,params}),transaction:async statements=>{
    await db.exec('BEGIN');try{for(const s of statements)await db.query(s.text,s.params);await db.exec('COMMIT');}catch(e){await db.exec('ROLLBACK');throw e;}
  }};
  const source=ts.transpileModule(await readFile(new URL('../lib/attendance.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(source,{exports,require:name=>name==='@/lib/db'?{getSql:()=>deferred}:name==='./attendance-auditorium'?{buildAuditoriumBlocks:()=>[]}: {},process:{env:{}},Date,Intl});
  await exports.saveAttendanceSessions([{id:'activity-test',activityId:1,title:'QA Taller',type:'Taller',venue:'QA',startsAt:at('13:00'),endsAt:at('14:00'),isSimulation:false,active:true}],'qa',false);
  assert.equal((await db.query('SELECT active FROM attendance_sessions WHERE id=$1',[day.id])).rows[0].active,true);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM attendance_support_visits')).rows[0].n,2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM attendance_assignments WHERE session_id=$1',[day.id])).rows[0].n,2);
  await db.query("INSERT INTO attendance_assignments VALUES('activity-test','op@example.invalid','qa',NOW())");
  assert.equal((await scan('entry',{session:'activity-test',token:'token-student'})).outcome,'not_enrolled','Normal workshop still checks enrollment, not support role');
  assert.equal((await scan('exit',{session:'activity-test',token:'token-student'})).outcome,'exit_not_required');
  await assert.rejects(db.query("INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,updated_by) VALUES('bad','bad','Actividad','QA',$1,$2,'qa')",[at('08:00'),at('09:00')]));
  // Actual CSV handler, auth boundary + SQL report -> serialized hours/detail.
  let csvActor='student@example.invalid',reportCalls=0;
  const routeCode=ts.transpileModule(await readFile(new URL('../app/administracion/asistencia/exportar/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const csvExports={};
  const csvDeps={
    '@/auth':{auth:async()=>({user:{email:csvActor}})},
    '@/lib/attendance-rules':{attendanceCsvCell},
    '@/lib/attendance':{isAttendanceAdmin:email=>email==='coordinator@example.invalid',
      attendanceReport:async id=>{reportCalls++;return (await db.query(supportReportQuery,[id??null,false])).rows;},
      attendanceVisits:async id=>{reportCalls++;return (await db.query(supportVisitsQuery,[id??null,false])).rows;}}
  };
  vm.runInNewContext(routeCode,{exports:csvExports,require:name=>csvDeps[name],URL,Response,Date,Intl,Set});
  assert.equal((await csvExports.GET(new Request('https://example.invalid/administracion/asistencia/exportar'))).status,302);
  assert.equal(reportCalls,0);
  csvActor='coordinator@example.invalid';
  const csvResponse=await csvExports.GET(new Request(`https://example.invalid/administracion/asistencia/exportar?sesion=${day.id}`));
  const csv=await csvResponse.text();
  assert.match(csv,/Horas de apoyo operativo/);assert.match(csv,/support_intervals/);
  const lines=csv.trim().split('\r\n').map(line=>line.split(',').map(cell=>cell.replace(/^"|"$/g,'')));
  const hoursColumn=lines[0].indexOf('Horas de apoyo operativo');
  assert.equal(lines[1][hoursColumn],'1');
  const detailResponse=await csvExports.GET(new Request(`https://example.invalid/administracion/asistencia/exportar?detalle=estancias&sesion=${day.id}`));
  assert.match(await detailResponse.text(),/Entrada sin salida: no computa/);
  assert.equal(csvResponse.headers.get('cache-control'),'private, no-store');
  console.log('OK: repeatable migration; single daily bucket, no work schedule or period selector; support-only eligibility/revocation; day/operator/assignment guards; QR/manual, duplicate/retry/reentry; zero without exit; real merged intervals without clipping or noon cutoff; CSV hours and exact entry/exit evidence; program sync preserves support history. PostgreSQL in memory only.');
} finally {await db.close();}
