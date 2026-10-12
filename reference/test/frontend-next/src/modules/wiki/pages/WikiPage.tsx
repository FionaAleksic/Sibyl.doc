import {useEffect,useMemo,useRef,useState,type CSSProperties,type FormEvent} from 'react';
import {wikiService} from '../services/wikiService';
import {normalizeWikiBlocks,defaultWikiBlockContent} from '../services/wikiBlocks';
import {wikiFolderOptions,wikiFolderSubtree} from '../services/wikiHierarchy';
import {WikiStructuredBlockEditor} from './WikiStructuredBlockEditor';
import {WikiBlockViewer} from './WikiBlockViewer';
import {WikiActivityPanel} from './WikiActivityPanel';
import {errorMessage} from '../../../shared/services/apiClient';
import type {WikiBlock,WikiDocument,WikiFolder,WikiVersion} from '../../../shared/types';
import legacyStyles from './wiki-legacy.css?inline';

const blockTypes=['heading','subheading','paragraph','code','table','checklist','notice','quote','linklist','image','video','audio'];
const blockLabels:Record<string,string>={
  title:'Titel',summary:'Zusammenfassung',toc:'Inhaltsverzeichnis',
  heading:'Überschrift',subheading:'Unterüberschrift',paragraph:'Absatz',
  code:'Code',table:'Tabelle',checklist:'Checkliste',notice:'Hinweis',
  quote:'Zitat',linklist:'Linkliste',image:'Bild',video:'Video',audio:'Audio',
  error_handling:'Error-Handling'
};
const order=(a:{name?:string;title?:string},b:{name?:string;title?:string})=>
  String(a.name??a.title??'').localeCompare(String(b.name??b.title??''),'de',{sensitivity:'base'});
const date=(raw?:string)=>raw?new Date(raw).toLocaleString('de-DE'):'–';
const freshBlocks=(title:string):WikiBlock[]=>['title','summary','toc','paragraph','error_handling'].map(type=>({
  id:crypto.randomUUID(),type,content:type==='title'?title:defaultWikiBlockContent(type)
}));

function WikiEditorBlocks({blocks,onChange,onError}:{
  blocks:WikiBlock[];onChange:(blocks:WikiBlock[])=>void;onError:(error:string)=>void
}){
  const [type,setType]=useState('paragraph');
  const [dragged,setDragged]=useState<string|null>(null);
  const blocksRef=useRef(blocks);
  blocksRef.current=blocks;
  const change=(index:number,value:WikiBlock|((previous:WikiBlock)=>WikiBlock))=>{
    const next=blocksRef.current.map((block,i)=>i===index?
      typeof value==='function'?value(block):value:block);
    blocksRef.current=next;onChange(next);
  };
  function move(from:number,to:number){
    const next=[...blocksRef.current];
    if(from<3||from>=next.length-1||to<3||to>=next.length-1||from===to)return;
    const [item]=next.splice(from,1);next.splice(to,0,item);
    blocksRef.current=next;onChange(next);
  }
  return <div className="wiki-edit-blocks" aria-label="Dokumentblöcke">
    {blocks.map((block,index)=>{
      if(block.type==='title')return null;
      const required=['summary','toc','error_handling'].includes(block.type);
      return <section key={block.id} className={'wiki-block-shell wiki-block-'+block.type}
        onDragOver={event=>{if(!required&&dragged){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
        onDrop={event=>{event.preventDefault();if(dragged)move(blocksRef.current.findIndex(b=>b.id===dragged),index);setDragged(null);}}>
        {!required&&<div className="wiki-block-controls">
          <button type="button" draggable onDragStart={event=>{setDragged(block.id);event.dataTransfer.setData('text/plain',block.id);}}
            onDragEnd={()=>setDragged(null)} title="Block ziehen" aria-label="Block ziehen">↕</button>
          <button type="button" onClick={()=>move(index,index-1)} disabled={index<=3} title="Nach oben">↑</button>
          <button type="button" onClick={()=>move(index,index+1)} disabled={index>=blocks.length-2} title="Nach unten">↓</button>
          <button type="button" className="wiki-danger-control" onClick={()=>onChange(blocks.filter(b=>b.id!==block.id))} title="Block entfernen">×</button>
        </div>}
        {required&&<span className="wiki-mandatory">Pflichtblock</span>}
        {block.type==='toc'?<div className="wiki-block-toc"><h3>Inhaltsverzeichnis</h3>
          {blocks.filter(b=>b.type==='heading'||b.type==='subheading').map((b,i)=>
            <p key={b.id} className={b.type==='subheading'?'wiki-toc-indented':''}>{i+1}. {String(b.content||'Unbenannte Überschrift')}</p>)}
          {!blocks.some(b=>b.type==='heading')&&<p className="wiki-muted">Noch keine Überschriften vorhanden.</p>}
        </div>:<>
          <h3 className="wiki-edit-block-label">{blockLabels[block.type]??block.type}</h3>
          <WikiStructuredBlockEditor block={block} onChange={next=>change(index,next)} onError={onError}/>
        </>}
      </section>;
    })}
    <div className="wiki-add-block">
      <label htmlFor="wikiBlockType">Block einfügen</label>
      <select id="wikiBlockType" value={type} onChange={e=>setType(e.target.value)}>
        {blockTypes.map(t=><option key={t} value={t}>{blockLabels[t]}</option>)}
      </select>
      <button type="button" className="wiki-button" onClick={()=>{
        const next:WikiBlock={id:crypto.randomUUID(),type,content:defaultWikiBlockContent(type)};
        onChange([...blocks.slice(0,-1),next,blocks[blocks.length-1]]);
      }}>＋ Block hinzufügen</button>
    </div>
  </div>;
}
type Modal='document'|'folder'|'editFolder'|'move'|'archive'|null;
type Draft=WikiDocument&{isNew?:boolean};

export function WikiPage({isAdmin=false,initialDocumentId=null}:{
  isAdmin?:boolean;initialDocumentId?:string|null
}){
  const [documents,setDocuments]=useState<WikiDocument[]>([]);
  const [folders,setFolders]=useState<WikiFolder[]>([]);
  const [selected,setSelected]=useState<WikiDocument|null>(null);
  const [editing,setEditing]=useState<Draft|null>(null);
  const [mode,setMode]=useState<'view'|'edit'|'activity'>('view');
  const [modal,setModal]=useState<Modal>(null);
  const [folderTarget,setFolderTarget]=useState<string|null>(null);
  const [folderName,setFolderName]=useState('');
  const [parentFolder,setParentFolder]=useState('');
  const [documentTitle,setDocumentTitle]=useState('');
  const [documentFolder,setDocumentFolder]=useState('');
  const [archiveConfirm,setArchiveConfirm]=useState('');
  const [query,setQuery]=useState('');
  const [collapsed,setCollapsed]=useState<Set<string>>(()=>new Set());
  const [versions,setVersions]=useState<WikiVersion[]>([]);
  const [showVersions,setShowVersions]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const requestId=useRef(0);

  const folderOptions=useMemo(()=>wikiFolderOptions(folders),[folders]);
  const folderPaths=useMemo(()=>{
    const byId=new Map(folders.map(f=>[f.id,f]));
    const result=new Map<string,string>();
    for(const f of folders){
      const names:string[]=[];const seen=new Set<string>();let cursor:WikiFolder|undefined=f;
      while(cursor&&!seen.has(cursor.id)){seen.add(cursor.id);names.unshift(cursor.name);cursor=cursor.parent_id?byId.get(cursor.parent_id):undefined;}
      result.set(f.id,names.join(' / '));
    }
    return result;
  },[folders]);
  const dirty=editing!==null&&(editing.isNew===true||JSON.stringify({
    title:editing.title,folder_id:editing.folder_id??null,blocks:editing.blocks
  })!==JSON.stringify({
    title:selected?.title,folder_id:selected?.folder_id??null,blocks:selected?.blocks
  }));
  const allowLeave=()=>!dirty||window.confirm('Ungespeicherte Änderungen verwerfen?');
  const canEdit=selected?.can_edit!==false;

  async function refresh():Promise<WikiDocument[]>{
    const [docs,dirs]=await Promise.all([wikiService.list(),wikiService.folders()]);
    setDocuments(docs);setFolders(dirs);
    return docs;
  }
  async function open(id:string,skipConfirm=false){
    if(!skipConfirm&&!allowLeave())return;
    const sequence=++requestId.current;
    setError('');
    try{
      const doc=await wikiService.get(id);
      if(sequence!==requestId.current)return;
      setSelected(doc);setEditing(null);setMode('view');setShowVersions(false);
    }catch(e){if(sequence===requestId.current)setError(errorMessage(e));}
  }
  useEffect(()=>{
    let active=true;
    Promise.all([wikiService.list(),wikiService.folders()]).then(([docs,dirs])=>{
      if(!active)return;
      setDocuments(docs);setFolders(dirs);setLoading(false);
      const target=initialDocumentId||docs[0]?.id;
      if(target)void open(target,true);
    }).catch(e=>{if(active){setLoading(false);setError(errorMessage(e));}});
    return()=>{active=false;requestId.current++;};
  // Initial document selection is handled separately for later cross-module navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(initialDocumentId)void open(initialDocumentId);},[initialDocumentId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function work(action:()=>Promise<void>){
    setBusy(true);setError('');
    try{await action();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  function openDocumentModal(){
    if(!allowLeave())return;
    setDocumentTitle('');setDocumentFolder(selected?.folder_id??'');setModal('document');
  }
  function draftNew(event:FormEvent){
    event.preventDefault();
    const title=documentTitle.trim();
    if(!title)return;
    const draft:Draft={
      id:'',isNew:true,title,folder_id:documentFolder||null,
      version:0,can_edit:true,blocks:freshBlocks(title)
    };
    setEditing(draft);setSelected(null);setMode('edit');setModal(null);
  }
  async function save(closeAfter=false){
    if(!editing)return;
    await work(async()=>{
      const title=editing.title.trim();
      if(!title)throw new Error('Bitte einen Dokumenttitel eingeben.');
      const blocks=normalizeWikiBlocks(editing.blocks??[]).map(block=>
        block.type==='title'?{...block,content:title}:block);
      const item=editing.isNew?
        await wikiService.create({title,folder_id:editing.folder_id??null,blocks}):
        await wikiService.update(editing.id,{
          title,folder_id:editing.folder_id??null,version:editing.version??0,blocks
        });
      setSelected(item);setEditing(closeAfter?null:item);
      setMode(closeAfter?'view':'edit');
      await refresh();
    });
  }
  function exitEdit(){
    if(!allowLeave())return;
    setEditing(null);
    setMode('view');
    if(!selected)setShowVersions(false);
  }
  function newFolder(parent:string|null=null){
    setFolderTarget(null);setFolderName('');setParentFolder(parent??'');setModal('folder');
  }
  function editFolder(id:string){
    const item=folders.find(f=>f.id===id);
    if(!item||!item.can_edit)return;
    setFolderTarget(id);setFolderName(item.name);setParentFolder(item.parent_id??'');setModal('editFolder');
  }
  function saveFolder(event:FormEvent){
    event.preventDefault();
    void work(async()=>{
      if(!folderName.trim())return;
      if(modal==='editFolder'&&folderTarget){
        await wikiService.editFolder(folderTarget,{name:folderName.trim(),parent_id:parentFolder||null});
      }else{
        await wikiService.addFolder({name:folderName.trim(),parent_id:parentFolder||null});
      }
      await refresh();setModal(null);
    });
  }
  function deleteFolder(){
    const item=folders.find(f=>f.id===folderTarget);
    if(!item?.can_delete||!window.confirm('Ordner „'+item.name+'“ wirklich löschen? Der Ordner muss leer sein.'))return;
    void work(async()=>{await wikiService.removeFolder(item.id);await refresh();setModal(null);});
  }
  function moveDocument(event:FormEvent){
    event.preventDefault();
    if(!selected)return;
    void work(async()=>{
      if((selected.folder_id??'')===parentFolder){setModal(null);return;}
      const updated=await wikiService.update(selected.id,{
        title:selected.title,folder_id:parentFolder||null,version:selected.version??0,blocks:selected.blocks??[]
      });
      setSelected(updated);await refresh();setModal(null);
    });
  }
  async function download(){
    if(!selected)return;
    await work(async()=>{
      const blob=await wikiService.export(selected.id);
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=(selected.slug||'wiki')+'.zip';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
  }
  async function importDocument(file:File|null){
    if(!file||!allowLeave())return;
    if(!/\.zip$/i.test(file.name)){setError('Bitte eine ZIP-Datei auswählen.');return;}
    await work(async()=>{
      const item=await wikiService.import(file,null);
      await refresh();setSelected(item);setEditing(null);setMode('view');
    });
  }
  function archiveDocument(event:FormEvent){
    event.preventDefault();
    if(!selected||archiveConfirm!==selected.title)return;
    void work(async()=>{
      await wikiService.remove(selected.id);
      const docs=await refresh();
      setModal(null);setSelected(null);setEditing(null);setShowVersions(false);
      if(docs.length)await open(docs[0].id,true);
    });
  }
  function history(){
    if(!selected)return;
    void work(async()=>{setVersions(await wikiService.versions(selected.id));setShowVersions(v=>!v);});
  }
  function activity(){
    if(!isAdmin||!allowLeave())return;
    setEditing(null);setMode('activity');setShowVersions(false);
  }
  function toggleFolder(id:string){
    setCollapsed(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});
  }
  function descendants(id:string):Set<string>{return wikiFolderSubtree(folders,id);}
  function subtreeCount(id:string):number{
    const ids=descendants(id);
    return documents.filter(doc=>ids.has(doc.folder_id??'')).length+
      folders.filter(f=>f.parent_id===id).length;
  }
  function docRow(doc:WikiDocument,depth:number,searchResult=false){
    return <button key={doc.id} type="button"
      className={'wiki-tree-doc'+(selected?.id===doc.id?' active':'')}
      style={{'--tree-depth':depth} as CSSProperties}
      role="treeitem" aria-current={selected?.id===doc.id?'page':undefined}
      onClick={()=>void open(doc.id)}>
      <strong>{doc.title}</strong>
      <small>{searchResult?folderPaths.get(doc.folder_id??'')||'Ohne Ordner':
        'Version '+(doc.version??1)+' · '+date(doc.updated_at)}</small>
    </button>;
  }
  function folderNode(item:WikiFolder,depth:number,visited:Set<string>):React.ReactNode{
    if(visited.has(item.id))return null;
    const nextVisited=new Set(visited);nextVisited.add(item.id);
    const subFolders=folders.filter(f=>f.parent_id===item.id).sort(order);
    const subDocs=documents.filter(doc=>doc.folder_id===item.id).sort(order);
    const folded=collapsed.has(item.id);
    return <div className="wiki-folder-wrap" role="group" key={item.id}>
      <div className="wiki-folder-row" style={{'--tree-depth':depth} as CSSProperties}>
        <button type="button" onClick={()=>toggleFolder(item.id)} aria-expanded={!folded}
          aria-label={(folded?'Ordner öffnen: ':'Ordner schließen: ')+item.name}>{folded?'▸':'▾'}</button>
        <button type="button" className="wiki-folder-label" onClick={()=>toggleFolder(item.id)}>
          <span className="wiki-folder-icon">▰</span><span className="wiki-folder-name">{item.name}</span>
          <span className="wiki-folder-count">{subtreeCount(item.id)}</span>
        </button>
        <button type="button" onClick={()=>newFolder(item.id)} title={'Unterordner in '+item.name+' erstellen'} aria-label={'Unterordner in '+item.name+' erstellen'}>+</button>
        <button type="button" disabled={!item.can_edit} onClick={()=>editFolder(item.id)}
          title={'Ordner '+item.name+' bearbeiten'}>⋯</button>
      </div>
      {!folded&&<div>{subDocs.map(doc=>docRow(doc,depth+1))}
        {subFolders.map(child=>folderNode(child,depth+1,nextVisited))}</div>}
    </div>;
  }
  const search=query.trim().toLocaleLowerCase('de-DE');
  const matches=search?documents.filter(doc=>(doc.title+' '+(folderPaths.get(doc.folder_id??'')||'Ohne Ordner'))
    .toLocaleLowerCase('de-DE').includes(search)).sort(order):[];
  return <section className="wiki-legacy" aria-label="Wiki">
    <style>{legacyStyles}</style>
    <aside className="wiki-sidebar" aria-label="Dokumentnavigation">
      <div className="wiki-sidebar-head"><h1>Wiki</h1></div>
      <div className="wiki-sidebar-actions">
        <button type="button" className="wiki-button" disabled={busy} onClick={openDocumentModal}>＋ Dokument</button>
        <button type="button" className="wiki-button secondary" disabled={busy}
          onClick={()=>fileRef.current?.click()}>Importieren</button>
        <button type="button" className="wiki-button secondary" disabled={busy}
          title="Ordner erstellen" onClick={()=>newFolder(null)}>＋ Ordner</button>
        <input ref={fileRef} hidden type="file" accept=".zip,application/zip,application/x-zip-compressed"
          aria-label="ZIP importieren" onChange={e=>{void importDocument(e.target.files?.[0]??null);e.target.value='';}}/>
      </div>
      <label className="wiki-field-label" htmlFor="wikiSearch">Dokumente suchen</label>
      <input id="wikiSearch" type="search" placeholder="Titel oder Ordner …" value={query}
        onChange={e=>setQuery(e.target.value)} autoComplete="off"/>
      <div className="wiki-nav-switch"><span>Dokumente</span><span className="wiki-count">{documents.length}</span></div>
      <div className="wiki-doc-tree" role="tree" aria-label="Wiki-Dokumente">
        {loading?<p className="wiki-tree-empty">Dokumente werden geladen …</p>:search?
          matches.length?matches.map(doc=>docRow(doc,0,true)):
            <p className="wiki-tree-empty">Keine Dokumentationen gefunden.</p>:<>
          {documents.some(doc=>!doc.folder_id)&&<div className="wiki-tree-root">
            <div className="wiki-tree-root-label">Ohne Ordner ({documents.filter(doc=>!doc.folder_id).length})</div>
            {documents.filter(doc=>!doc.folder_id).sort(order).map(doc=>docRow(doc,0))}
          </div>}
          {folders.filter(f=>!f.parent_id).sort(order).map(f=>folderNode(f,0,new Set()))}
          {!documents.length&&!folders.length&&<p className="wiki-tree-empty">Noch keine Dokumentationen oder Ordner.</p>}
        </>}
      </div>
    </aside>
    <main className="wiki-main">
      {error&&<p role="alert" className="message error">{error}</p>}
      {isAdmin&&<div className="wiki-secondary-nav">
        <button type="button" className={mode==='activity'?'active':''} onClick={activity}>Aktivitätsprotokoll</button>
        {mode==='activity'&&<button type="button" onClick={()=>setMode('view')}>Zurück zu Dokumenten</button>}
      </div>}
      {mode==='activity'?<WikiActivityPanel onClose={()=>setMode('view')} onOpen={id=>void open(id)}/>:
        mode==='edit'&&editing?<section className="wiki-document">
          <div className="wiki-doc-toolbar wiki-editor-toolbar">
            <span className="wiki-mode-badge">Bearbeitungsmodus</span>
            <span className={'wiki-save-status'+(dirty?' changed':'')}>{dirty?'Ungespeicherte Änderungen':'Gespeichert'}</span>
            <span className="wiki-grow"/>
            <button className="wiki-button secondary" type="button" onClick={exitEdit} disabled={busy}>Schließen</button>
            <button className="wiki-button secondary" type="button" onClick={()=>void save(false)} disabled={busy||!dirty}>Speichern</button>
            <button className="wiki-button" type="button" onClick={()=>void save(true)} disabled={busy}>Speichern & Schließen</button>
          </div>
          <div className="wiki-paper">
            <div className="wiki-title-block">
              <div className="wiki-eyebrow">Dokumentation</div>
              <input aria-label="Dokumenttitel" className="wiki-edit-title" value={editing.title} maxLength={240}
                onChange={e=>setEditing(old=>old?{...old,title:e.target.value,
                  blocks:old.blocks?.map(b=>b.type==='title'?{...b,content:e.target.value}:b)}:old)}/>
              <div className="wiki-doc-meta">
                <span>Ordner: <b>{folderPaths.get(editing.folder_id??'')||'Ohne Ordner'}</b></span>
                <span>Status: <b>{editing.isNew?'Entwurf':'Gespeichert'}</b></span>
                <span>Version: <b>{editing.isNew?'noch nicht gespeichert':editing.version}</b></span>
              </div>
            </div>
            <div className="wiki-folder-picker"><label>Ordner <select value={editing.folder_id??''}
              onChange={e=>setEditing(old=>old?{...old,folder_id:e.target.value||null}:old)}>
              <option value="">Ohne Ordner</option>{folderOptions.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
            </select></label></div>
            <WikiEditorBlocks blocks={editing.blocks??[]} onChange={blocks=>setEditing(old=>old?{...old,blocks}:old)}
              onError={setError}/>
          </div>
        </section>:selected?<article className="wiki-document">
          <div className="wiki-doc-toolbar">
            <span className="wiki-mode-badge">Lesemodus</span><span className="wiki-grow"/>
            <button type="button" className="wiki-button secondary" disabled={busy} onClick={()=>void download()}>Exportieren</button>
            <button type="button" className="wiki-button secondary" disabled={!canEdit||busy}
              onClick={()=>{setParentFolder(selected.folder_id??'');setModal('move');}}>Verschieben</button>
            <button type="button" className="wiki-button secondary" disabled={busy} onClick={history}>Versionen</button>
            <button type="button" className="wiki-button" disabled={!canEdit||busy}
              onClick={()=>{setEditing(structuredClone(selected));setMode('edit');}}>Bearbeiten</button>
          </div>
          <div className="wiki-paper">
            <header className="wiki-title-block">
              <div className="wiki-eyebrow">Dokumentation</div><h1>{selected.title}</h1>
              <div className="wiki-doc-meta">
                <span>Autor: <b>{selected.created_by||'–'}</b></span>
                <span>Ordner: <b>{folderPaths.get(selected.folder_id??'')||'Ohne Ordner'}</b></span>
                <span>Status: <b>Gespeichert</b></span>
                <span>Version: <b>{selected.version??1}</b></span>
                <span>Geändert: <b>{date(selected.updated_at)}</b></span>
              </div>
            </header>
            {showVersions&&<section className="wiki-version-history"><h2>Versionsverlauf</h2>
              {versions.map(version=><p key={version.id??version.version}>Version {version.version} · {version.changed_by||'–'} · {date(version.created_at)}</p>)}
              {versions.length===0&&<p>Keine Versionen gefunden.</p>}
            </section>}
            <WikiBlockViewer blocks={selected.blocks??[]}/>
          </div>
          {isAdmin&&<section className="wiki-danger-zone"><div>
            <h2>Danger Zone</h2><p>Gelöschte Dokumentationen bleiben 90 Tage wiederherstellbar.</p>
          </div><button type="button" className="wiki-button danger" onClick={()=>{
            setArchiveConfirm('');setModal('archive');
          }}>Dokumentation löschen</button></section>}
        </article>:<div className="wiki-empty-state">
          <h2>Keine Dokumentation ausgewählt</h2>
          <p>{loading?'Wiki wird geladen …':'Wähle links eine Dokumentation aus oder erstelle eine neue.'}</p>
          <button type="button" className="wiki-button" onClick={openDocumentModal}>Neue Dokumentation erstellen</button>
        </div>}
    </main>
    {modal&&<div className="wiki-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setModal(null);}}>
      <div className="wiki-dialog" role="dialog" aria-modal="true" aria-label={
        modal==='document'?'Neue Dokumentation':modal==='folder'?'Neuer Ordner':
        modal==='editFolder'?'Ordner bearbeiten':modal==='move'?'Dokument verschieben':'Dokument löschen'}>
        {modal==='document'?<form onSubmit={draftNew}>
          <h2>Neue Dokumentation</h2><label>Titel <input autoFocus required maxLength={240} value={documentTitle}
            onChange={e=>setDocumentTitle(e.target.value)}/></label>
          <label>Ordner <select value={documentFolder} onChange={e=>setDocumentFolder(e.target.value)}>
            <option value="">Ohne Ordner</option>{folderOptions.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
          </select></label>
          <div className="wiki-dialog-actions"><button type="button" className="wiki-button secondary" onClick={()=>setModal(null)}>Abbrechen</button>
            <button className="wiki-button" type="submit">Dokument erstellen</button></div>
        </form>:modal==='folder'||modal==='editFolder'?<form onSubmit={saveFolder}>
          <h2>{modal==='folder'?'Ordner erstellen':'Ordner bearbeiten'}</h2>
          <label>Ordnername <input required autoFocus maxLength={120} value={folderName}
            onChange={e=>setFolderName(e.target.value)}/></label>
          <label>Übergeordneter Ordner <select value={parentFolder} onChange={e=>setParentFolder(e.target.value)}>
            <option value="">Root-Ebene</option>
            {folderOptions.filter(f=>modal!=='editFolder'||!folderTarget||
              !descendants(folderTarget).has(f.id)).map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
          </select></label>
          <div className="wiki-dialog-actions">{modal==='editFolder'&&folders.find(f=>f.id===folderTarget)?.can_delete&&
            <button type="button" className="wiki-button danger" onClick={deleteFolder}>Löschen</button>}
            <button type="button" className="wiki-button secondary" onClick={()=>setModal(null)}>Abbrechen</button>
            <button type="submit" className="wiki-button" disabled={busy}>Speichern</button></div>
        </form>:modal==='move'?<form onSubmit={moveDocument}>
          <h2>Dokumentation verschieben</h2>
          <label>Zielordner <select value={parentFolder} onChange={e=>setParentFolder(e.target.value)}>
            <option value="">Ohne Ordner</option>{folderOptions.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
          </select></label>
          <div className="wiki-dialog-actions"><button className="wiki-button secondary" type="button" onClick={()=>setModal(null)}>Abbrechen</button>
            <button className="wiki-button" disabled={busy}>Verschieben</button></div>
        </form>:<form onSubmit={archiveDocument}>
          <h2>Dokumentation löschen</h2><p>Das Dokument kann innerhalb von 90 Tagen aus dem Archiv wiederhergestellt werden.</p>
          <label>Zur Bestätigung den Titel <b>{selected?.title}</b> eingeben:
            <input autoFocus value={archiveConfirm} onChange={e=>setArchiveConfirm(e.target.value)}/></label>
          <div className="wiki-dialog-actions"><button type="button" className="wiki-button secondary" onClick={()=>setModal(null)}>Abbrechen</button>
            <button className="wiki-button danger" disabled={busy||archiveConfirm!==selected?.title}>Löschen</button></div>
        </form>}
      </div>
    </div>}
  </section>;
}
