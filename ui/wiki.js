'use strict';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const x=document.createElement(tag);x.textContent=String(text??'');return x;};
let docs=[],selected=null,editing=false;
function status(message){$('status').textContent=message;}
function renderMarkdown(content){
 const fragment=document.createDocumentFragment();let pre=null;
 for(const line of String(content||'').split(/\r?\n/)){
  if(line.startsWith(String.fromCharCode(96,96,96))){if(pre){pre=null;}else{pre=node('pre','');fragment.append(pre);}continue;}
  if(pre){pre.append(node('div',line));continue;}
  const header=/^(#{1,3})\s+(.+)$/.exec(line);
  if(header)fragment.append(node('h'+header[1].length,header[2]));
  else if(line.startsWith('> '))fragment.append(node('blockquote',line.slice(2)));
  else if(line.startsWith('- '))fragment.append(node('p','• '+line.slice(2)));
  else if(line.trim())fragment.append(node('p',line));
 }
 return fragment;
}
function list(){
 const q=$('search').value.trim().toLowerCase(),tree=$('tree');tree.replaceChildren();
 const visible=docs.filter(d=>[d.value.title,d.value.folder,d.value.markdown].join(' ').toLowerCase().includes(q));
 $('count').textContent=visible.length+' Dokumente';
 const folders=new Map();
 for(const d of visible){const folder=d.value.folder||'Allgemein';if(!folders.has(folder))folders.set(folder,[]);folders.get(folder).push(d);}
 for(const [folder,items] of [...folders.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de'))){
  const heading=node('div',folder+' · '+items.length);heading.className='folder';tree.append(heading);
  for(const d of items){const b=node('button',d.value.title);b.type='button';b.className='item'+(selected?.id===d.id?' active':'');
   const v=node('small','Version '+d.version);b.append(v);b.onclick=()=>select(d);tree.append(b);}
 }
}
function select(doc){
 if(editing&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;
 editing=false;selected=doc;$('form').hidden=true;$('read').hidden=false;$('history').hidden=true;
 $('heading').textContent=doc?.value.title||'Dokumentation';
 $('meta').textContent=doc?'Version '+doc.version+' · '+(doc.value.folder||'Allgemein'):'Wähle ein Dokument oder erstelle eines.';
 $('read').replaceChildren();
 if(doc)$('read').append(renderMarkdown(doc.value.markdown));
 else $('read').append(node('p','Noch kein Dokument ausgewählt.'));
 $('versions').disabled=!doc;$('archive').disabled=!doc;
 list();
}
async function refresh(id){
 docs=await SibylBridge.list('pages');
 editing=false;select(docs.find(d=>d.id===id)||docs[0]||null);
}
function edit(doc){
 selected=doc;editing=true;
 $('form').hidden=false;$('read').hidden=true;$('history').hidden=true;
 $('title').value=doc?.value.title||'';
 $('folder').value=doc?.value.folder||'Allgemein';
 $('markdown').value=doc?.value.markdown||'';
 $('title').focus();
}
$('new').onclick=()=>{if(!editing||confirm('Eingabe verwerfen?'))edit(null);};
$('edit').onclick=()=>edit(selected);
$('cancel').onclick=()=>{editing=false;select(selected)};
$('search').oninput=list;
$('form').onsubmit=async e=>{
 e.preventDefault();
 const value={title:$('title').value.trim(),folder:$('folder').value.trim()||'Allgemein',markdown:$('markdown').value};
 if(!value.title||!value.markdown.trim()){status('Titel und Inhalt erforderlich.');return;}
 try{
  const record=selected?await SibylBridge.update('pages',selected.id,selected.version,value):
   await SibylBridge.create('pages',value);
  editing=false;await refresh(record.id);status('Gespeichert: Version '+record.version);
 }catch(e){status('Speichern fehlgeschlagen: '+e.message);}
};
$('archive').onclick=async()=>{
 if(!selected||!confirm('Dieses Dokument archivieren?'))return;
 try{const id=selected.id;await SibylBridge.archive('pages',id,selected.version);
  selected=null;await refresh(null);status('Dokument archiviert.');}catch(e){status(e.message);}
};
$('versions').onclick=async()=>{
 if(!selected)return;
 try{const history=await SibylBridge.history('pages',selected.id);
  $('history').hidden=false;$('history-items').replaceChildren();
  for(const entry of history){const button=node('button','Version '+entry.version+' · '+entry.updatedAt);button.type='button';
   button.className='item';button.onclick=()=>{
    $('read').replaceChildren(renderMarkdown(entry.value.markdown));
    $('read').hidden=false;$('form').hidden=true;status('Historische Version '+entry.version+' (nur Ansicht).');
   };$('history-items').append(button);}
 }catch(e){status(e.message);}
};
SibylBridge.list('pages').then(rows=>{docs=rows;select(docs[0]||null)}).catch(e=>status('Core Datenspeicher nicht verfügbar: '+e.message));