import {useCallback,useEffect,useState} from 'react';
import {BookOpen,Plus,Save,Trash2,Edit3} from 'lucide-react';
import type {Credentials,Addon,AddonDocument} from '../types/domain';
import {api} from '../services/api';
export default function DocumentsPage({addon,credentials,admin}:{addon:Addon;credentials:Credentials;admin:boolean}){
 const [rows,setRows]=useState<AddonDocument[]>([]);
 const [selected,setSelected]=useState<number|null>(null);
 const [title,setTitle]=useState('');const [body,setBody]=useState('');
 const [editing,setEditing]=useState(false);const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const canWrite=addon.documentMode==='personal'||admin;
 const reload=useCallback(async()=>{try{setRows(await api.documents(credentials,addon.addonId));setError('')}catch(e){setError(String(e))}},[credentials,addon.addonId]);
 useEffect(()=>{void reload()},[reload]);
 function newDocument(){setSelected(null);setTitle('');setBody('');setEditing(true)}
 function choose(doc:AddonDocument){setSelected(doc.id);setTitle(doc.title);setBody(doc.body);setEditing(false)}
 async function save(){setBusy(true);try{
  if(selected===null)await api.addDocument(credentials,addon.addonId,{title,body});
  else await api.editDocument(credentials,addon.addonId,selected,{title,body});
  setEditing(false);setSelected(null);setTitle('');setBody('');await reload();
 }catch(e){setError(String(e))}finally{setBusy(false)}}
 async function remove(){if(selected===null||!window.confirm('Dokument löschen?'))return;
  setBusy(true);try{await api.deleteDocument(credentials,addon.addonId,selected);setSelected(null);setTitle('');setBody('');await reload()}
  catch(e){setError(String(e))}finally{setBusy(false)}}
 return <><div className="page-heading"><div><div className="eyebrow">ADDON / {addon.addonId}</div><h1>{addon.name}</h1>
  <p>{addon.description}</p></div>{canWrite&&<button className="primary" onClick={newDocument}><Plus size={16}/>Neu</button>}</div>
  {error&&<div className="error" role="alert">{error}</div>}
  <div className="document-layout"><div className="document-list"><div className="eyebrow">DOKUMENTE</div>
   {rows.map(d=><button className={selected===d.id?'selected-document':''} key={d.id} onClick={()=>choose(d)}>
    <BookOpen size={16}/><span>{d.title}<small>{new Date(d.updatedAt).toLocaleDateString('de-DE')}</small></span></button>)}
   {!rows.length&&<p>Keine Dokumente vorhanden.</p>}
  </div><div className="document-editor">{editing?<form onSubmit={e=>{e.preventDefault();void save()}}>
   <label>Titel<input required maxLength={255} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   <label>Inhalt<textarea rows={14} maxLength={100000} value={body} onChange={e=>setBody(e.target.value)}/></label>
   <div className="document-actions"><button type="button" className="secondary" onClick={()=>setEditing(false)}>Abbrechen</button>
    <button className="primary" disabled={busy}><Save size={16}/>Speichern</button></div></form>:
   selected===null?<div className="empty-document">Wähle ein Dokument aus.</div>:<>
    <div className="document-actions">{canWrite&&<><button className="secondary" onClick={()=>setEditing(true)}><Edit3 size={16}/>Bearbeiten</button>
     <button className="secondary" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/>Löschen</button></>}</div>
    <h2>{title}</h2><div className="document-body">{body}</div></>}</div></div></>;
}
