import {pathToFileURL} from 'node:url';
import {createDevServer,listenLocal} from './dev-server.mjs';
export const app=await createDevServer();
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) await listenLocal(app);
