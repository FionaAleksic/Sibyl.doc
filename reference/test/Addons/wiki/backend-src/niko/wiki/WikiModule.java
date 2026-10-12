package niko.wiki;

import app.webplatform.config.AppSettings;
import app.webplatform.db.Db;
import app.webplatform.error.ApiException;
import app.webplatform.platform.api.PlatformModuleBackend;
import app.webplatform.platform.api.PlatformModuleContext;
import app.webplatform.platform.api.PlatformModuleRequest;
import app.webplatform.platform.api.PlatformModuleResponse;
import app.webplatform.service.AuditService;
import app.webplatform.service.MediaService;
import app.webplatform.service.TransferService;
import app.webplatform.service.WikiService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

public final class WikiModule implements PlatformModuleBackend {
    private final ObjectMapper mapper = new ObjectMapper();
    private Db db;
    private WikiService wiki;
    private MediaService media;
    private TransferService transfer;
    private AuditService audit;

    @Override
    public void start(PlatformModuleContext context) {
        JdbcTemplate jdbc = new JdbcTemplate(context.dataSource());
        db = new Db(jdbc, mapper);
        AppSettings settings = new AppSettings(new StandardEnvironment());
        wiki = new WikiService(db, jdbc);
        media = new MediaService(settings, db, jdbc);
        transfer = new TransferService(wiki, media, settings, db, jdbc, mapper);
        audit = new AuditService(db);
    }

    @Override
    public PlatformModuleResponse handle(PlatformModuleRequest request) throws Exception {
        String method = request.method().toUpperCase(Locale.ROOT);
        String path = request.path();

        if (path.startsWith("/archive/")) {
            requireAdmin(request);
            return handleArchive(method, path, request);
        }

        if (method.equals("GET") && path.equals("/documents")) {
            return json(wiki.listDocuments().stream().map(d -> decorateDocument(request, d)).toList());
        }
        if (method.equals("GET") && path.matches("/documents/[^/]+/versions")) {
            return json(wiki.versions(segment(path,2)));
        }
        if (method.equals("GET") && path.matches("/documents/[^/]+/export")) {
            TransferService.ExportResult result = transfer.buildExport(segment(path,2));
            try {
                audit.record(request.username(),"export","wiki_document",segment(path,2),
                        Map.of("title",result.title(),"media_count",result.mediaCount()));
                return new PlatformModuleResponse(200,"application/zip",Files.readAllBytes(result.path()));
            } finally {
                Files.deleteIfExists(result.path());
            }
        }
        if (method.equals("GET") && path.matches("/documents/[^/]+")) {
            return json(decorateDocument(request, wiki.getDocument(segment(path,2))));
        }
        if (method.equals("POST") && path.equals("/documents")) {
            Map<String,Object> body=parseBody(request);
            return json(db.transaction(() -> {
                Map<String,Object> doc=wiki.createDocument(body,request.username());
                Map<String,Object> details = new LinkedHashMap<>();
                details.put("title",doc.get("title"));
                details.put("version",doc.get("version"));
                details.put("folder_id",doc.get("folder_id"));
                audit.record(request.username(),"create","wiki_document",String.valueOf(doc.get("id")),details);
                return decorateDocument(request,doc);
            }));
        }
        if (method.equals("PUT") && path.matches("/documents/[^/]+")) {
            String id=segment(path,2);
            Map<String,Object> body=parseBody(request);
            return json(db.transaction(() -> {
                Map<String,Object> before=wiki.getDocument(id);
                if(!canEdit(request,before)) throw ApiException.of(403,"Du darfst nur eigene Dokumentationen bearbeiten.");
                if(body.get("version")==null) throw ApiException.of(422,"Dokumentversion fehlt.");
                Map<String,Object> doc=wiki.updateDocument(id,body,request.username());
                List<String> changes = new ArrayList<>();
                if(!Objects.equals(before.get("title"),doc.get("title"))) changes.add("title");
                if(!Objects.equals(before.get("blocks"),doc.get("blocks"))) changes.add("content");
                if(!Objects.equals(before.get("folder_id"),doc.get("folder_id"))) changes.add("folder");
                Map<String,Object> details = new LinkedHashMap<>();
                details.put("title",doc.get("title"));
                details.put("version",doc.get("version"));
                details.put("changes",changes.isEmpty()?List.of("metadata"):changes);
                details.put("old_folder_id",before.get("folder_id"));
                details.put("folder_id",doc.get("folder_id"));
                audit.record(request.username(),"update","wiki_document",id,details);
                return decorateDocument(request,doc);
            }));
        }
        if (method.equals("DELETE") && path.matches("/documents/[^/]+")) {
            requireAdmin(request);
            String id=segment(path,2);
            return json(db.transaction(() -> {
                Map<String,Object> before=wiki.getDocument(id);
                Map<String,Object> archived=wiki.deleteDocument(id,request.username());
                Map<String,Object> details = new LinkedHashMap<>();
                details.put("title",before.get("title"));
                details.put("version",before.get("version"));
                details.put("folder_id",before.get("folder_id"));
                details.put("retention_days",90);
                details.put("purge_after",archived.get("purge_after"));
                audit.record(request.username(),"delete","wiki_document",id,details);
                return Map.of("ok",true,"purge_after",archived.get("purge_after"),"retention_days",90);
            }));
        }

        if (method.equals("GET") && path.equals("/folders")) {
            return json(wiki.listFolders().stream().map(f -> decorateFolder(request,f)).toList());
        }
        if (method.equals("POST") && path.equals("/folders")) {
            Map<String,Object> body=parseBody(request);
            return json(db.transaction(() -> {
                Map<String,Object> folder=wiki.createFolder(body,request.username());
                Map<String,Object> details = new LinkedHashMap<>();
                details.put("name",folder.get("name"));
                details.put("parent_id",folder.get("parent_id"));
                audit.record(request.username(),"create","wiki_folder",String.valueOf(folder.get("id")),details);
                return decorateFolder(request,folder);
            }));
        }
        if (method.equals("PUT") && path.matches("/folders/[^/]+")) {
            String id=segment(path,2); Map<String,Object> body=parseBody(request);
            return json(db.transaction(() -> {
                Map<String,Object> before=wiki.getFolder(id);
                if(!canEdit(request,before)) throw ApiException.of(403,"Du darfst diesen Ordner nicht bearbeiten.");
                Map<String,Object> folder=wiki.updateFolder(id,body,request.username());
                List<String> changes = new ArrayList<>();
                if(!Objects.equals(before.get("name"),folder.get("name"))) changes.add("name");
                if(!Objects.equals(before.get("parent_id"),folder.get("parent_id"))) changes.add("parent");
                Map<String,Object> details = new LinkedHashMap<>();
                details.put("name",folder.get("name"));
                details.put("changes",changes.isEmpty()?List.of("metadata"):changes);
                details.put("old_parent_id",before.get("parent_id"));
                details.put("parent_id",folder.get("parent_id"));
                audit.record(request.username(),"update","wiki_folder",id,details);
                return decorateFolder(request,folder);
            }));
        }
        if (method.equals("DELETE") && path.matches("/folders/[^/]+")) {
            String id=segment(path,2);
            return json(db.transaction(() -> {
                Map<String,Object> folder=wiki.getFolder(id);
                if(!canEdit(request,folder)) throw ApiException.of(403,"Du darfst diesen Ordner nicht löschen.");
                wiki.deleteFolder(id);
                audit.record(request.username(),"delete","wiki_folder",id,Map.of("name",folder.get("name")));
                return Map.of("ok",true);
            }));
        }

        if (method.equals("GET") && path.equals("/activity")) {
            requireAdmin(request);
            int limit=intQuery(request,"limit",250);
            if(limit<1 || limit>500) throw ApiException.of(422,"Ungültige Anfrage.");
            String documentId=query(request,"document_id");
            return json(audit.listWikiEvents(limit,documentId.isBlank()?null:documentId));
        }

        if (method.equals("POST") && path.equals("/import")) {
            String filename=query(request,"filename");
            if(filename.isBlank() || filename.length()>255 || !filename.toLowerCase(Locale.ROOT).endsWith(".zip")) {
                throw ApiException.of(415,"Dokumentimport erwartet eine .zip-Datei.");
            }
            String contentType=request.contentType()==null?"application/octet-stream":
                    request.contentType().split(";",2)[0].trim().toLowerCase(Locale.ROOT);
            if(!Set.of("application/zip","application/x-zip-compressed",
                    "application/octet-stream","").contains(contentType)) {
                throw ApiException.of(415,"Dokumentimport erwartet eine ZIP-Datei.");
            }
            if(request.body().length==0) throw ApiException.of(422,"ZIP-Datei ist leer.");
            if(request.body().length>TransferService.MAX_ARCHIVE_BYTES) throw ApiException.of(413,"ZIP-Datei ist zu groß.");
            Path tmp=Files.createTempFile("niko-wiki-module-import-",".zip");
            try {
                Files.write(tmp,request.body());
                String folder=query(request,"folder_id");
                Map<String,Object> doc=db.transaction(() -> transfer.importArchive(tmp,request.username(),folder.isBlank()?null:folder));
                Map<String,Object> details = new LinkedHashMap<>();
                details.put("title",doc.get("title"));
                details.put("source_filename",Path.of(filename).getFileName().toString());
                details.put("media_count",countMediaBlocks(doc.get("blocks")));
                audit.record(request.username(),"import","wiki_document",String.valueOf(doc.get("id")),details);
                return json(decorateDocument(request,doc));
            } finally {
                Files.deleteIfExists(tmp);
            }
        }

        if (method.equals("POST") && path.equals("/media")) {
            String filename=query(request,"filename");
            if(filename.isBlank() || filename.length()>255) throw ApiException.of(422,"Ungültige Anfrage.");
            String contentType=request.contentType()==null?"application/octet-stream":
                    request.contentType().split(";",2)[0].trim().toLowerCase(Locale.ROOT);
            Map<String,Object> item=db.transaction(() ->
                    media.saveUpload(new ByteArrayInputStream(request.body()),filename,contentType,request.username()));
            audit.record(request.username(),"upload","media",String.valueOf(item.get("id")),
                    Map.of("filename",item.get("filename"),"content_type",item.get("content_type"),
                            "size_bytes",item.get("size_bytes")));
            Map<String,Object> result=new LinkedHashMap<>(item);
            result.put("url","/api/modules/Sibyl.wiki/media/"+item.get("id"));
            return json(result);
        }
        if (method.equals("GET") && path.matches("/media/[^/]+")) {
            Map<String,Object> item=media.getMedia(segment(path,2));
            return new PlatformModuleResponse(
                    200,
                    Db.string(item.get("content_type")),
                    Files.readAllBytes(media.pathOf(item)));
        }
        if (method.equals("DELETE") && path.matches("/media/[^/]+")) {
            requireAdmin(request);
            String id=segment(path,2);
            Map<String,Object> item=media.getMedia(id);
            db.transaction(() -> {media.deleteMedia(id);return null;});
            audit.record(request.username(),"delete","media",id,
                    Map.of("filename",item.get("original_name"),"size_bytes",item.get("size_bytes")));
            return json(Map.of("ok",true));
        }

        return new PlatformModuleResponse(404,"application/json",Map.of("detail","Wiki-Endpunkt wurde nicht gefunden."));
    }

    private PlatformModuleResponse handleArchive(String method,String path,PlatformModuleRequest request) {
        if(method.equals("GET") && path.equals("/archive/documents")) {
            return json(Map.of("active",wiki.listDocuments(),"deleted",wiki.listDeletedDocuments()));
        }
        if(method.equals("GET") && path.matches("/archive/documents/[^/]+/history")) {
            return json(wiki.adminDocumentHistory(segment(path,3)));
        }
        if(method.equals("POST") && path.matches("/archive/deleted/[^/]+/restore")) {
            String id=segment(path,3);
            Map<String,Object> doc=db.transaction(() -> wiki.restoreDeletedDocument(id,request.username()));
            audit.record(request.username(),"restore","wiki_document",id,
                    Map.of("title",doc.get("title"),"version",doc.get("version")));
            return json(decorateDocument(request,doc));
        }
        return new PlatformModuleResponse(404,"application/json",Map.of("detail","Wiki-Admin-Endpunkt wurde nicht gefunden."));
    }

    private Map<String,Object> decorateDocument(PlatformModuleRequest request,Map<String,Object> source) {
        Map<String,Object> out=new LinkedHashMap<>(source);
        out.put("can_edit",canEdit(request,out));
        out.put("can_delete",isAdmin(request));
        return out;
    }

    private Map<String,Object> decorateFolder(PlatformModuleRequest request,Map<String,Object> source) {
        Map<String,Object> out=new LinkedHashMap<>(source);
        boolean can=canEdit(request,out);
        out.put("can_edit",can);
        out.put("can_delete",can);
        return out;
    }

    private boolean canEdit(PlatformModuleRequest request,Map<String,Object> row) {
        return isAdmin(request)
                || request.roles().contains("editor")
                || Db.string(row.get("created_by")).equalsIgnoreCase(request.username());
    }

    private static boolean isAdmin(PlatformModuleRequest request){return request.roles().contains("admin");}
    private static void requireAdmin(PlatformModuleRequest request){
        if(!isAdmin(request)) throw ApiException.of(403,"Administratorrolle erforderlich.");
    }

    private Map<String,Object> parseBody(PlatformModuleRequest request) {
        try {
            if(request.body()==null || request.body().length==0) return new LinkedHashMap<>();
            return mapper.readValue(request.body(),new TypeReference<Map<String,Object>>(){});
        } catch(Exception ex) {
            throw ApiException.of(422,"Ungültige JSON-Anfrage.");
        }
    }

    private static String query(PlatformModuleRequest request,String key) {
        List<String> values=request.query().get(key);
        return values==null||values.isEmpty()?"":String.valueOf(values.get(0));
    }
    private static int intQuery(PlatformModuleRequest request,String key,int fallback) {
        String value=query(request,key);
        if(value.isBlank()) return fallback;
        try { return Integer.parseInt(value); }
        catch(NumberFormatException ex) { throw ApiException.of(422,"Ungültige Anfrage."); }
    }

    private static int countMediaBlocks(Object raw) {
        if(!(raw instanceof List<?> blocks)) return 0;
        int count=0;
        for(Object value:blocks) {
            if(!(value instanceof Map<?,?> block)) continue;
            if(!Set.of("image","video","audio").contains(String.valueOf(block.get("type")))) continue;
            if(block.get("content") instanceof Map<?,?> content &&
                    content.get("mediaId")!=null && !String.valueOf(content.get("mediaId")).isBlank()) count++;
        }
        return count;
    }
    private static String segment(String path,int index) {
        String[] parts=path.split("/");
        return parts.length>index?parts[index]:"";
    }
    private static PlatformModuleResponse json(Object body){return PlatformModuleResponse.json(body);}
}
