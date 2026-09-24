// One-time source migration helper. Translation resources remain explicit reviewed files.
import ts from 'typescript';
import {readFileSync,writeFileSync} from 'node:fs';
const keys=new Set();
for(const path of ['frontend/src/main.tsx','frontend/src/deposits.tsx']){
  const source=readFileSync(path,'utf8'),file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),edits=[];
  const call=text=>{keys.add(text);return `t(${JSON.stringify(text)})`;};
  const attrs=new Set(['title','subtitle','text','label','placeholder','aria-label','alt']);
  function visit(node){
    if(ts.isFunctionDeclaration(node)&&node.name&&/^[A-Z]/.test(node.name.text)&&node.body){edits.push({start:node.body.getStart(file)+1,end:node.body.getStart(file)+1,text:' const {t,msg,language}=useI18n(); '});}
    if(ts.isJsxText(node)){
      const raw=node.getText(file),text=raw.replace(/\s+/g,' ').trim();
      if(/[A-Za-z]/.test(text)&&text!=='Re:Material'){
        const lead=/^\s/.test(raw)&&!raw.includes('\n')?'{" "}':'';const trail=/\s$/.test(raw)&&!raw.includes('\n')?'{" "}':'';
        edits.push({start:node.getStart(file),end:node.end,text:`${lead}{${call(text)}}${trail}`});
      }
    }
    if(ts.isJsxAttribute(node)&&attrs.has(node.name.getText(file))&&node.initializer&&ts.isStringLiteral(node.initializer)&&/[A-Za-z]/.test(node.initializer.text)&&node.initializer.text!=='https://'){
      edits.push({start:node.initializer.getStart(file),end:node.initializer.end,text:`{${call(node.initializer.text)}}`});return;
    }
    if(ts.isStringLiteral(node)&&ts.isConditionalExpression(node.parent)&&(node===node.parent.whenTrue||node===node.parent.whenFalse)){
      let ancestor=node.parent;while(ancestor&&!ts.isJsxExpression(ancestor))ancestor=ancestor.parent;
      const attr=ancestor?.parent;
      if(ancestor&&!(ts.isJsxAttribute(attr)&&!attrs.has(attr.name.getText(file)))&&/[A-Z]|\s/.test(node.text)&&node.text){edits.push({start:node.getStart(file),end:node.end,text:call(node.text)});return;}
    }
    if(ts.isPropertyAssignment(node)&&['title','text','button','label'].includes(node.name.getText(file))&&ts.isStringLiteral(node.initializer)){
      edits.push({start:node.initializer.getStart(file),end:node.initializer.end,text:call(node.initializer.text)});return;
    }
    ts.forEachChild(node,visit);
  }
  visit(file);let output=source;for(const e of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,e.start)+e.text+output.slice(e.end);writeFileSync(path,output);
}
writeFileSync('frontend/src/locales/en.json',JSON.stringify(Object.fromEntries([...keys].sort().map(k=>[k,k])),null,2)+'\n');
