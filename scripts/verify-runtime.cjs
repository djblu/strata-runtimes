const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{createServer}=require('node:http'),{pathToFileURL}=require('node:url');
async function verify(r){
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'strata-runtime-verify-'));let bridge,scenario='read',requests=0;const frames=[];
await fs.writeFile(path.join(dir,'input.txt'),'READ_OK');
const server=createServer(async(req,res)=>{
let body='';for await(const chunk of req)body+=chunk;if(!body){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'list',data:[{id:'runtime-test',object:'model'}]}));return;}const data=JSON.parse(body);requests++;
res.setHeader('Content-Type','text/event-stream');
if(scenario==='cancel'){res.write('data: '+JSON.stringify({id:'cancel',object:'chat.completion.chunk',created:1,model:'runtime-test',choices:[{index:0,delta:{role:'assistant',content:'waiting'},finish_reason:null}]})+'\n\n');return;}
let delta={role:'assistant',content:'RUNTIME_OK'};let reason='stop';
if(requests===1&&['read','write','deny'].includes(scenario)){
const tools=data.tools||[];
const tool=tools.find(t=>t.function?.name===(scenario==='read'?'read':'write'));
if(!tool){res.end();return;}

const args=scenario==='read'?{file_path:path.join(dir,'input.txt')}:{file_path:path.join(dir,scenario+'.txt'),content:'WRITE_OK'};
delta={role:'assistant',tool_calls:[{index:0,id:'call-'+scenario,type:'function',function:{name:tool.function.name,arguments:JSON.stringify(args)}}]};reason='tool_calls';
}
res.write('data: '+JSON.stringify({id:'compat',object:'chat.completion.chunk',created:1,model:'runtime-test',choices:[{index:0,delta,finish_reason:null}]})+'\n\n');
res.write('data: '+JSON.stringify({id:'compat',object:'chat.completion.chunk',created:1,model:'runtime-test',choices:[{index:0,delta:{},finish_reason:reason}]})+'\n\n');res.end('data: [DONE]\n\n');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const timer=setTimeout(()=>{console.error('COMPAT TIMEOUT');process.exit(1)},120000);
try{
const {createAgentBridge}=await import(pathToFileURL(path.join(r.sourcePath,'apps/host/server/agent/agent-bridge.mjs')));
bridge=createAgentBridge({dataDir:path.join(dir,'data'),gate:true,env:{...process.env,STRATA_HARNESS_DIR:r.harnessPath},nodePath:r.nodePath,localInstances:()=>[{id:'compat',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,modelId:'runtime-test',context:32768,key:'test-only',vision:false,slots:1}],connections:()=>[],defaultLocalId:()=> 'compat'});
for(scenario of ['read','write','deny']){
requests=0;frames.length=0;
await bridge.runTurn({chatId:scenario,message:'Run compatibility check',workspacePath:dir,mode:'manual',thinking:'Off',onFrame:f=>{
frames.push(f);
if(f.type==='agent-tool'&&f.tool?.state==='proposed')void bridge.approve({chatId:scenario,callId:f.tool.id,decision:scenario==='deny'?'deny':'approve'});
}});
console.log('Runtime check passed:',scenario);
if(frames.some(f=>f.type==='error'))throw Error('Scenario failed '+scenario);
if(scenario==='read'&&!frames.some(f=>f.type==='agent-tool'&&String(f.tool?.result).includes('READ_OK')))throw Error('Read tool did not execute');
if(['write','deny'].includes(scenario)&&!frames.some(f=>f.type==='agent-tool'&&f.tool?.state==='proposed'))throw Error('Approval was not requested');
if(scenario==='write'&&await fs.readFile(path.join(dir,'write.txt'),'utf8')!=='WRITE_OK')throw Error('Write failed');
if(scenario==='deny'){try{await fs.access(path.join(dir,'deny.txt'));throw Error('Denied write ran');}catch(e){if(e.code!=='ENOENT')throw e;}}
}
scenario='compact';requests=0;await bridge.compactCommand({chatId:'read',workspacePath:dir,mode:'manual',thinking:'Off',onFrame:f=>{if(f.type==='error')throw Error(JSON.stringify(f));}});console.log('COMPACTION PASSED');
const changed=await bridge.setMode('read','bypass');if(!changed.applied)throw Error('Live permission update failed');console.log('Live permission update passed');
scenario='cancel';requests=0;let cancelled=false;
await bridge.runTurn({chatId:'cancel',message:'Wait for cancellation',workspacePath:dir,mode:'manual',thinking:'Off',onFrame:f=>{
 if(f.type==='delta'&&!cancelled){cancelled=true;void bridge.stop('cancel');}
}});
if(!cancelled||bridge.isRunning('cancel'))throw Error('Cancellation failed');console.log('Cancellation passed');

}finally{clearTimeout(timer);await bridge?.close();server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
}
module.exports={verify};
