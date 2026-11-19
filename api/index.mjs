import { cloud } from '../neon-api.mjs';
export default async function handler(req,res) {
  await cloud.ready();
  cloud.server.emit('request',req,res);
}
