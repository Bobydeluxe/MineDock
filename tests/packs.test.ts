import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import yazl from 'yazl';
import { fixture } from './helpers';
import { PackService } from '../packages/marketplace/packs';
import { ModrinthCatalog } from '../packages/marketplace/modrinth';
import { ManagedContentService } from '../packages/marketplace/content';
import { DownloadManager } from '../packages/minecraft/downloads';
import { OperationService } from '../packages/core/operations';
import { Logger } from '../packages/core/logger';
import { createHash } from 'node:crypto';
afterEach(() => vi.restoreAllMocks());
async function zip() {
  const archive = new yazl.ZipFile(), chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    archive.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    archive.outputStream.on('error', reject); archive.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
  });
  archive.addBuffer(Buffer.from(JSON.stringify({pack:{pack_format:61,description:'Test'}})), 'pack.mcmeta');
  archive.end(); return result;
}
async function setup() {
  const f = await fixture(), logger = new Logger(path.join(f.root, 'logs'));
  const catalog = new ModrinthCatalog(f.repo), downloads = new DownloadManager(f.bus, f.repo);
  const jobs = new OperationService(f.repo, f.bus, logger);
  const service = new PackService(f.repo, catalog, downloads, new ManagedContentService(f.repo, downloads, jobs));
  const bytes = await zip(), hash = createHash('sha512').update(bytes).digest('hex');
  vi.spyOn(downloads, 'download').mockImplementation(async (_url, file) => {await writeFile(file,bytes);});
  const version = (id: string) => ({id:id+'v1',projectId:id,name:'1',publishedAt:'2026-10-08',changelog:'',gameVersions:[f.server.version],loaders:['datapack'],files:[{url:'https://cdn.modrinth.com/data/'+id+'/file.zip',filename:id+'.zip',primary:true,hash:{algorithm:'sha512' as const,value:hash}}],dependencies:id==='root'?[{projectId:'required',required:true},{projectId:'optional',required:false,type:'optional' as const}]:[]});
  vi.spyOn(catalog,'project').mockImplementation(async id => ({id,title:id,kind:'datapack',serverSide:true}));
  vi.spyOn(catalog,'packVersions').mockImplementation(async (_s,_k,id) => [version(id)]);
  vi.spyOn(catalog,'version').mockImplementation(async id => version(id.replace(/v1$/,'')));
  return {...f,service,catalog,version,bytes,cleanup:async()=>{await logger.flush();await f.cleanup();}};
}
it('installs only required dependencies into the chosen world and survives reopening SQLite',async()=>{
 const f=await setup(); try {
  const plan=await f.service.plan(f.server,{kind:'datapack',projectId:'root'});
  expect(plan.entries.map(e=>e.project.id)).toEqual(['required','root']); expect(plan.optional).toEqual(['optional']);
  await f.service.apply(f.server,plan.token);
  const server=f.repo.server(f.server.id);
  expect(server.packs).toHaveLength(2);
  expect(await readFile(path.join(server.path,'world/datapacks/root.zip'))).toEqual(f.bytes);
  expect((await f.service.inventory(server,'datapack')).problems).toEqual([]);
  expect(await readFile(path.join(server.path,'server.properties'),'utf8')).not.toContain('resource-pack=');
 } finally {await f.cleanup();}
});
it('refuses manual collisions and restores the complete previous folder and metadata',async()=>{
 const f=await setup();try {
  await mkdir(path.join(f.server.path,'world/datapacks'));await writeFile(path.join(f.server.path,'world/datapacks/root.zip'),'manual');
  const plan=await f.service.plan(f.server,{kind:'datapack',projectId:'root'});
  await expect(f.service.apply(f.server,plan.token)).rejects.toThrow('manual');
  expect(await readFile(path.join(f.server.path,'world/datapacks/root.zip'),'utf8')).toBe('manual');expect(f.repo.server(f.server.id).packs).toBeUndefined();
 }finally{await f.cleanup();}
});
it('rejects stale plans, wrong versions, world traversal and dependency conflicts',async()=>{
 const f=await setup();try {
  await expect(f.service.plan(f.server,{kind:'datapack',world:'../other',projectId:'root'})).rejects.toThrow();
  const plan=await f.service.plan(f.server,{kind:'datapack',projectId:'root'});
  await expect(f.service.apply({...f.server,version:'1.20.1'},plan.token)).rejects.toThrow('changed');
  vi.mocked(f.catalog.packVersions).mockResolvedValue([{...f.version('root'),gameVersions:['1.20.1']}]);
  await expect(f.service.plan(f.server,{kind:'datapack',projectId:'root'})).rejects.toThrow('compatible');
 }finally{await f.cleanup();}
});
it('imports local resource packs, calculates real hashes, requires a URL and protects changed files',async()=>{
 const f=await setup();try {
  const source=path.join(f.root,'local.zip');await writeFile(source,f.bytes);
  await f.service.import(f.server,'resourcepack',source);
  let server=f.repo.server(f.server.id);const item=server.packs![0]!;
  expect(item.sha1).toBe(createHash('sha1').update(f.bytes).digest('hex'));
  await expect(f.service.action(server,{id:item.id,action:'select',confirmation:server.name,url:'file:///local.zip'})).rejects.toThrow();
  await f.service.action(server,{id:item.id,action:'select',confirmation:server.name,url:'https://example.com/pack.zip'});
  server=f.repo.server(server.id);expect(server.activeResourcePack).toBe(item.id);
  expect(await readFile(path.join(server.path,'server.properties'),'utf8')).toContain('resource-pack-sha1='+item.sha1);
  await writeFile(path.join(server.path,'resourcepacks/local.zip'),'changed');
  await expect(f.service.action(server,{id:item.id,action:'remove',confirmation:server.name})).rejects.toThrow('changed');
 }finally{await f.cleanup();}
});
