import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
const js=await build({entryPoints:['tests/fixtures/fixture.ts'],bundle:true,write:false,format:'esm'});
const html=await readFile('tests/fixtures/chess-board.html');
createServer((req,res)=>{
  const path=new URL(req.url,'http://127.0.0.1:8787').pathname;
  if(path==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js.outputFiles[0].contents);}
  else if(['/chess-board.html','/blocked.html'].includes(path)){res.setHeader('Content-Type','text/html');res.end(html);}
  else{res.statusCode=404;res.end('Not found');}
}).listen(8787,'127.0.0.1',()=>console.log('Treino local: http://127.0.0.1:8787/chess-board.html'));
