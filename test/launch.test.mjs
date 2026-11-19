import test from 'node:test';
import assert from 'node:assert/strict';
import {openLocalStore} from '../local-store.mjs';
import {createCloud} from '../neon-api.mjs';
import {verify} from './journeys.mjs';

test('housing discovery and private conversations', async () => {
  const store = await openLocalStore({sqlitePath:':memory:'});
  const app=createCloud({...store,identity:req=>req.headers.member?{id:req.headers.member,name:req.headers.member}:null});
  async function a(id,path,data,expected=200){
    const result=await app.inject({method:data===undefined?'GET':'POST',url:'/api/'+path,headers:{member:id},payload:data});
    assert.equal(result.statusCode,expected,path+' '+result.body);
    return result.json();
  }
  try {
    await a('','listings',undefined,401);
    for(const id of ['ada','bea','cam']) await a(id,'me');
    assert.equal((await a('ada','me')).profileComplete,false);
    await a('ada','member-profile',{action:'draft',name:'Ada'});
    assert.equal((await a('ada','me')).profileComplete,false);
    await a('ada','member-profile',{action:'publish',name:'Ada'},400);
    await verify({a});
    assert.equal((await a('ada','me')).profileComplete,true);
  } finally {await app.close();await store.close();}
});
