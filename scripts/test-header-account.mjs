import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

async function load(path,dependencies) {
  const code=ts.transpileModule(await readFile(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,require:name=>{
    if(!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  }});
  return exports;
}
const common={'react':React,'react/jsx-runtime':jsxRuntime};
const login=await load('../components/google-login-button.tsx',{
  ...common,'next/navigation':{useRouter:()=>({push:()=>{throw new Error('SSR must not navigate');}})},
  '@/components/quantito-loader':{QuantitoLoader:()=>null},
});
const header=await load('../components/site-header.tsx',{
  ...common,'lucide-react':Object.fromEntries(['ArrowUp','LogOut','Menu','X'].map(name=>[name,()=>null])),
  'next/image':props=>React.createElement('img',{src:props.src,alt:props.alt,width:props.width,height:props.height}),
  'next/link':props=>React.createElement('a',props),
  '@/app/auth-actions':{signOutToHome:()=>{throw new Error('SSR must not sign out');}},
  '@/components/google-login-button':login,
  '@/components/profile-avatar':{ProfileAvatar:()=>React.createElement('span',{'aria-hidden':true},'QA')},
});
for(const signed of [false,true]) {
  const html=renderToStaticMarkup(React.createElement(header.SiteHeader,{user:signed?{name:'QA',image:null}:null}));
  const label=signed?'Mi cuenta':'Iniciar sesión';
  assert.equal(html.split(label).length-1,1,'Exactly one account/login control');
  assert.ok(html.indexOf(label)>html.indexOf('</nav>'),'Account is outside the collapsible navigation');
  assert.equal(html.includes('Log in'),false);
  assert.ok(html.includes('aria-controls="main-menu"'));
  if(signed) assert.ok(html.includes('href="/mi-cuenta"'));
}
console.log('OK: one account/login control outside collapsible navigation, Spanish label, same account href; rendering does not navigate or authenticate. No external services.');
