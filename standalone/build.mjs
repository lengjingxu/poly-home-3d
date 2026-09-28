import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
const result=await build({entryPoints:['standalone/scene.js'],bundle:true,minify:true,format:'iife',write:false,legalComments:'inline'});
writeFileSync('standalone/home-floorplan.html',readFileSync('standalone/shell.html','utf8').replace('/*BUNDLE*/',()=>result.outputFiles[0].text.replace(/[ 	]+$/gm,'')));
