import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
const source=stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/radar-admin-api/lifecycle-mail.ts',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/export /g,'');
const item={id:'test-id',kind:'concluded',recipient:'fixture@example.invalid',municipality_name:'Municipio <prueba>',municipality_code:'0102'};
function fixture(password,send=async()=>({accepted:[item.recipient]})){
 const calls=[];const messages=[];const context={Deno:{env:{get:()=>password}},nodemailer:{createTransport:config=>{assert.equal(config.secure,true);assert.equal(config.tls.rejectUnauthorized,true);return{sendMail:async message=>{messages.push(message);return send(message);},close(){}}}}};
 const api=vm.runInNewContext(source+'\n({deliverLifecycleMail,lifecycleMessage})',context);
 const service={rpc:async(name,args)=>{calls.push(args);return {data:args.p_operation==='claim'?item:null,error:null};}};
 return {...api,service,calls,messages};
}
test('missing SMTP never claims delivery and leaves a retryable notification',async()=>{const f=fixture(undefined);const result=await f.deliverLifecycleMail(f.service,item.id);assert.equal(result.mail_status,'failed');assert.deepEqual(f.calls.map(x=>x.p_operation),['claim','failed']);assert.equal(f.messages.length,0);});
test('SMTP acceptance saves receipt and sends only the queued recipient',async()=>{const f=fixture('test-only');const result=await f.deliverLifecycleMail(f.service,item.id);assert.equal(result.mail_status,'sent');assert.deepEqual(f.calls.map(x=>x.p_operation),['claim','sent']);assert.equal(f.messages[0].to,item.recipient);assert.equal(f.messages[0].messageId,'<radar-lifecycle-test-id@wowlatam.com>');assert.ok(f.messages[0].html.includes('Municipio &lt;prueba&gt;'));});
test('all three messages distinguish retained data, reactivation and permanent deletion',()=>{const f=fixture('test-only');for(const kind of ['concluded','reactivated','deleted']){const mail=f.lifecycleMessage({...item,kind});assert.ok(mail.html.includes('radar-welcome-logo.png'));assert.ok(mail.text.includes(item.municipality_name));assert.ok(mail.subject.startsWith('RADAR'));}assert.ok(f.lifecycleMessage({...item,kind:'deleted'}).text.includes('período de retención'));});
test('already claimed messages are not sent again',async()=>{const f=fixture('test-only');const result=await f.deliverLifecycleMail({rpc:async()=>({data:null,error:null})},item.id);assert.equal(result.mail_status,'unchanged');assert.equal(f.messages.length,0);});
