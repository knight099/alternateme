import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { openLocalStore } from './local-store.mjs';
import { createCloud } from './neon-api.mjs';

export async function createDevServer(options) {
  const store=await openLocalStore(options);
  const app=createCloud(store);
  app.addHook('onClose',async()=>store.close());
  const mime={html:'text/html',js:'text/javascript',css:'text/css',png:'image/png',webp:'image/webp',svg:'image/svg+xml',jpg:'image/jpeg',ico:'image/x-icon',woff2:'font/woff2'};
  app.get('/*',async(req,reply)=>{
    const name=req.params['*']||'index.html';
    if(!/^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.[a-z0-9]+$/i.test(name)) return reply.code(404).send({error:'Page unavailable.'});
    const type=mime[name.split('.').at(-1)];
    if(!type) return reply.code(404).send({error:'Page unavailable.'});
    try {return reply.type(type).send(await readFile(new URL('./public/'+name,import.meta.url)));}
    catch(error){if(error.code==='ENOENT')return reply.code(404).send({error:'Page unavailable.'});throw error;}
  });
  return app;
}
export async function listenLocal(app) {
  const address=await app.listen({port:Number(process.env.PORT||3000),host:'127.0.0.1'});
  console.log('Alternateme is running at '+address);
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>app.close().catch(console.error));
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) await listenLocal(await createDevServer());
