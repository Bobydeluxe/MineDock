import path from 'node:path';
import {readdir,stat,open} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import type {AppCore} from './app';
import {logSearchSchema,macroSchema,logCategory,type LogSearch,type LogSearchResult,type MacroInput} from '../domain/console';
import {containedPath} from '../security/paths';
import {redact} from '../security/secrets';
import {DomainError} from '../domain/errors';
export class ConsoleTools {
 constructor(private core:AppCore){}
 async search(id:string,raw:LogSearch):Promise<LogSearchResult>{
  const input=logSearchSchema.parse(raw),server=this.core.repo.server(id),root=await containedPath(server.path,'logs'),result:LogSearchResult={lines:[],truncated:false,files:0};
  const names=await readdir(root).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return [] as string[];throw e;});
  let readBytes=0;const files=[];
  for(const name of names.filter(n=>n.endsWith('.log')).slice(0,200)){const file=await containedPath(root,name),info=await stat(file);if(info.isFile()&&(!input.from||info.mtimeMs>=Date.parse(input.from)))files.push({name,file,at:info.mtimeMs,size:info.size});}
  files.sort((a,b)=>b.at-a.at);
  for(const entry of files.slice(0,40)) {
   const limit=Math.min(entry.size,2*1024**2,16*1024**2-readBytes);if(limit<=0){result.truncated=true;break;}
   const file=await open(entry.file,'r');let text='';try{const buffer=Buffer.alloc(limit);const {bytesRead}=await file.read(buffer,0,limit,Math.max(0,entry.size-limit));readBytes+=bytesRead;text=buffer.subarray(0,bytesRead).toString('utf8');if(entry.size>limit){result.truncated=true;text=text.slice(text.indexOf('\n')+1);}}finally{await file.close();}
   result.files++;
   const fileDate=/^(\d{4}-\d{2}-\d{2})/.exec(entry.name)?.[1]??new Date(entry.at).toISOString().slice(0,10);
   for(const line of text.split(/\r?\n/)) {
    if(!line.toLowerCase().includes(input.query.toLowerCase())||input.player&&!line.toLowerCase().includes(input.player.toLowerCase())||input.category!=='all'&&logCategory(line)!==input.category)continue;
    const time=/^\[(\d\d:\d\d:\d\d)\]/.exec(line)?.[1];const at=time?new Date(fileDate+'T'+time).toISOString():undefined;
    if(at&&((input.from&&at<input.from)||(input.to&&at>input.to)))continue;
    result.lines.push({file:entry.name,text:redact(line).slice(0,4096),at});if(result.lines.length>=500){result.truncated=true;return result;}
   }
  }
  if(files.length>40||names.length>200)result.truncated=true;return result;
 }
 async macro(id:string,raw:MacroInput):Promise<string>{
  const input=macroSchema.parse(raw),server=this.core.repo.server(id);
  if(server.status!=='running')throw new DomainError('RUNNING','Start the server before running a macro.');
  if(!['vanilla','paper','purpur','fabric','forge','neoforge'].includes(server.engine))throw new DomainError('CAPABILITY','These macros require a Java server.');
  const promise=this.core.exclusive(id,()=>this.core.jobs.run('console.macro',input.name,id,async context=>{
   for(let i=0;i<input.steps.length;i++){
    context.signal.throwIfAborted();const step=input.steps[i]!;context.phase('applying',i,input.steps.length);
    if(step.type==='delay')await delay(step.seconds*1000,undefined,{signal:context.signal});
    else if(step.type==='backup')await this.core.backups.create(id,'macro',context.signal);
    else if(step.type==='restart')await this.core.supervisor.restart(id);
    else if(step.type==='stop')await this.core.supervisor.stop(id);
    else {const response=await this.core.supervisor.command(id,step.type==='save'?'save-all flush':'say '+('message'in step?step.message:''));if(/Unknown|Incorrect|Error|failed/i.test(response))throw new DomainError('COMMAND',response);}
   }
  }));
  void promise.catch(()=>undefined);
  await Promise.resolve();
  const operation=this.core.repo.operations().find(o=>o.serverId===id&&o.kind==='console.macro'&&!['completed','failed','cancelled'].includes(o.status));
  if(!operation){await promise;return '';}
  return operation.id;
 }
}
