import {api,apiBlob} from '../../../shared/services/apiClient';
import type {WikiDocument,WikiFolder,WikiVersion} from '../../../shared/types';

export interface WikiActivityEvent {
  id:number|string;occurred_at:string;username:string;action:string;object_type:string;
  object_id?:string|null;details?:Record<string,unknown>
}

let wikiBase='/api/wiki';
let mediaBase='/api/media';
let adminBase='/api/admin/wiki';

export function configureWikiApi(config:{wikiBase?:string;mediaBase?:string;adminBase?:string}){
  if(config.wikiBase)wikiBase=config.wikiBase.replace(/\/$/,'');
  if(config.mediaBase)mediaBase=config.mediaBase.replace(/\/$/,'');
  if(config.adminBase)adminBase=config.adminBase.replace(/\/$/,'');
}

export function wikiMediaUrl(id:string){
  return mediaBase+'/'+encodeURIComponent(id);
}

const path=(id:string)=>wikiBase+'/documents/'+encodeURIComponent(id);
const folderPath=(id:string)=>wikiBase+'/folders/'+encodeURIComponent(id);

export const wikiService={
  list:()=>api<WikiDocument[]>(wikiBase+'/documents'),
  get:(id:string)=>api<WikiDocument>(path(id)),
  create:(data:{title:string;folder_id:string|null;blocks?:unknown})=>api<WikiDocument>(wikiBase+'/documents',{method:'POST',json:data}),
  update:(id:string,data:{title:string;folder_id:string|null;version:number;blocks:unknown})=>api<WikiDocument>(path(id),{method:'PUT',json:data}),
  remove:(id:string)=>api<{ok:boolean}>(path(id),{method:'DELETE'}),
  versions:(id:string)=>api<WikiVersion[]>(path(id)+'/versions'),
  folders:()=>api<WikiFolder[]>(wikiBase+'/folders'),
  addFolder:(data:{name:string;parent_id?:string|null})=>api<WikiFolder>(wikiBase+'/folders',{method:'POST',json:data}),
  editFolder:(id:string,data:{name:string;parent_id?:string|null})=>api<WikiFolder>(folderPath(id),{method:'PUT',json:data}),
  removeFolder:(id:string)=>api<{ok:boolean}>(folderPath(id),{method:'DELETE'}),
  export:(id:string)=>apiBlob(path(id)+'/export'),
  activity:(limit=300,documentId:string|null=null)=>api<WikiActivityEvent[]>(wikiBase+'/activity?limit='+limit+
    (documentId?'&document_id='+encodeURIComponent(documentId):'')),
  import:(file:File,folderId:string|null)=>api<WikiDocument>(wikiBase+'/import?filename='+encodeURIComponent(file.name)+
    (folderId?'&folder_id='+encodeURIComponent(folderId):''),{method:'POST',headers:{'Content-Type':file.type||'application/zip'},body:file}),
  media:(file:File)=>api<{id:string}>(mediaBase+'?filename='+encodeURIComponent(file.name),{
    method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file}),
  adminDocuments:()=>api<{active:WikiDocument[];deleted:WikiDocument[]}>(adminBase+'/archive/documents'),
  adminHistory:(id:string)=>api<Record<string,unknown>>(adminBase+'/archive/documents/'+encodeURIComponent(id)+'/history'),
  restore:(id:string)=>api<WikiDocument>(adminBase+'/archive/deleted/'+encodeURIComponent(id)+'/restore',{method:'POST'})
};
