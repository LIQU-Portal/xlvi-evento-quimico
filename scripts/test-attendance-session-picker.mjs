import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { assignedSessionDays, assignedSessionsForDay, filterSessionChoices, groupSessionChoices, sessionTimeTone } from '../lib/attendance-session-picker.ts';
import { buildSupportDay } from '../lib/attendance-support.ts';

const session=(id,start,end,extra={})=>({id,title:id,type:'Taller',venue:'Auditorio de Química',active:true,isSimulation:false,activityId:1,
  startsAt:`2026-10-20T${start}:00-06:00`,endsAt:`2026-10-20T${end}:00-06:00`,...extra});
const input=[session('Nomenclatura','13:00','15:00'),session('Redox','13:00','14:00'),
  session('CineMol','15:00','16:00',{venue:'Salón de usos múltiples',type:'Concurso'}),
  session('Auditorio','09:00','12:00',{type:'Conferencia',isAuditorium:true}),
  session('Mañana','13:00','15:00',{startsAt:'2026-10-21T13:00:00-06:00',endsAt:'2026-10-21T15:00:00-06:00'}),
  session('Inactiva','09:00','10:00',{active:false}),session('Inválida','09:00','10:00',{startsAt:'unknown'})];
const before=JSON.stringify(input);
assert.deepEqual(assignedSessionDays(input),['2026-10-20','2026-10-21']);
const day=assignedSessionsForDay(input,'2026-10-20');
assert.equal(day.length,4);
assert.equal(assignedSessionsForDay(input,'2026-10-22').length,0);
assert.deepEqual(filterSessionChoices(day,'NOMENCLATURA quimica','13:00').map(s=>s.id),['Nomenclatura']);
assert.deepEqual(filterSessionChoices(day,' salon multiples ','15:00').map(s=>s.id),['CineMol']);
assert.equal(filterSessionChoices(day,'','13:00').length,2);
assert.equal(filterSessionChoices(day,'','14:00').length,0);
const groups=groupSessionChoices(day);
assert.deepEqual(groups.map(g=>g.key),['conferences','13:00','15:00']);
assert.equal(groups[0].tone,'neutral');
assert.equal(groups[1].sessions.length,2);
assert.notEqual(groups[1].tone,groups[2].tone);
assert.equal(groupSessionChoices(filterSessionChoices(day,'Redox',''))[0].tone,groups[1].tone,'Search cannot change a start time color');
assert.equal(sessionTimeTone('13:00'),sessionTimeTone('13:30'));
assert.equal(JSON.stringify(input),before,'No props mutation');
const support=buildSupportDay({date:'2026-10-20',venue:'Mesa QA'});
const withSupport=groupSessionChoices([...day,support]);
assert.equal(withSupport.find(g=>g.key==='support').label,'Apoyo operativo · Todo el día');
assert.equal(withSupport.some(g=>g.key==='00:00'),false,'Calendar boundary is not presented as work schedule');
const utc=session('UTC','23:00','23:30',{startsAt:'2026-10-21T05:00:00Z',endsAt:'2026-10-21T05:30:00Z'});
assert.equal(assignedSessionsForDay([utc],'2026-10-20').length,1,'CDMX date, not UTC/device');
assert.equal(assignedSessionsForDay([utc],'2026-10-21').length,0);

// Execute the actual reader query in PostgreSQL memory: future-day consultation must not expand assignments.
const db=new PGlite();
try {
  for(const file of ['schema.sql','attendance.sql','attendance-auditorium.sql','attendance-support.sql']) await db.exec(await readFile(new URL(`../database/${file}`,import.meta.url),'utf8'));
  await db.exec(`INSERT INTO attendance_operators(email,updated_by) VALUES('one@example.invalid','qa'),('two@example.invalid','qa');
    INSERT INTO attendance_sessions(id,title,type,venue,starts_at,ends_at,activity_id,updated_by)
    SELECT s.id,s.id,'Taller','QA',((NOW() AT TIME ZONE 'America/Mexico_City')::date+s.days+TIME '13:00') AT TIME ZONE 'America/Mexico_City',
      ((NOW() AT TIME ZONE 'America/Mexico_City')::date+s.days+TIME '14:00') AT TIME ZONE 'America/Mexico_City',1,'qa'
    FROM (VALUES('today',0),('future',1),('other-operator',0)) s(id,days);
    INSERT INTO attendance_assignments VALUES('today','one@example.invalid','qa',NOW()),('future','one@example.invalid','qa',NOW()),('other-operator','two@example.invalid','qa',NOW());`);
  const source=ts.transpileModule(await readFile(new URL('../lib/attendance.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(source,{exports,require:name=>name==='@/lib/db'?{getSql:()=>({query:async(text,args)=>(await db.query(text,args)).rows})}
    :name==='@/lib/attendance-rules'?{areSimulationsEnabled:()=>false}: {},process:{env:{}},Date,Intl});
  assert.equal((await exports.listAttendanceSessions('one@example.invalid')).length,1,'Default remains today');
  const assigned=await exports.listAttendanceSessions('one@example.invalid',true);
  assert.deepEqual(assigned.map(s=>s.id),['today','future']);
  assert.equal(assigned.some(s=>s.id==='other-operator'),false);
  assert.equal((await exports.listAttendanceSessions('unknown@example.invalid',true)).length,0);
} finally {await db.close();}
console.log('OK: day/hour/search, stable colored time groups, neutral conferences, CDMX date, no mutations; real SQL query only returns assigned sessions, optional future consultation, default today. No external services.');
