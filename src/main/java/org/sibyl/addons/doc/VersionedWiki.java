package org.sibyl.addons.doc;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Versioned Wiki model. Deliberately no HTML rendering, no filesystem access
 * and no DB mutations. Authorization and persistence belong to the Core adapter.
 */
public final class VersionedWiki {
    public static final String MODULE_ID="Sibyl.doc";
    public static final String VERSION="0.1.0-rc.2";
    public record Revision(String pageId, long version, String folderId,
                           String title, String markdown, String editor,
                           Instant modifiedAt, boolean archived) {}
    private final Map<String,List<Revision>> pages=new HashMap<>();

    public synchronized Revision create(String folderId, String title,
                                        String markdown, String editor, Instant now) {
        validate(title,markdown,editor,now);
        String id=UUID.randomUUID().toString();
        Revision revision=new Revision(id,1,safeFolder(folderId),title.strip(),
                                        markdown,editor,now,false);
        pages.put(id,new ArrayList<>(List.of(revision)));
        return revision;
    }
    public synchronized Revision edit(String pageId, long expectedVersion,
                                      String folderId,String title,String markdown,
                                      String editor,Instant now) {
        validate(title,markdown,editor,now);
        Revision old=latest(pageId);
        if (old.archived()) throw new IllegalStateException("Archived page");
        if (old.version()!=expectedVersion)
            throw new IllegalStateException("Revision conflict");
        Revision revision=new Revision(pageId,expectedVersion+1,
            safeFolder(folderId),title.strip(),markdown,editor,now,false);
        pages.get(pageId).add(revision);
        return revision;
    }
    public synchronized Revision archive(String pageId,long expectedVersion,
                                         String editor,Instant now) {
        Revision old=latest(pageId);
        if (old.version()!=expectedVersion || old.archived())
            throw new IllegalStateException("Revision conflict");
        if (editor==null || editor.isBlank() || now==null)
            throw new IllegalArgumentException("Editor and time required");
        Revision revision=new Revision(pageId,expectedVersion+1,old.folderId(),
            old.title(),old.markdown(),editor,now,true);
        pages.get(pageId).add(revision);
        return revision;
    }
    public synchronized Revision latest(String pageId) {
        List<Revision> revisions=pages.get(pageId);
        if(revisions==null) throw new IllegalArgumentException("Unknown page");
        return revisions.get(revisions.size()-1);
    }
    public synchronized List<Revision> history(String pageId) {
        if(!pages.containsKey(pageId)) throw new IllegalArgumentException("Unknown page");
        return List.copyOf(pages.get(pageId));
    }
    public synchronized List<Revision> activePages() {
        return pages.values().stream().map(p->p.get(p.size()-1))
            .filter(p->!p.archived()).sorted((a,b)->a.title().compareToIgnoreCase(b.title()))
            .toList();
    }
    private static void validate(String title,String markdown,String editor,Instant now) {
        if(title==null || title.isBlank() || title.length()>240 ||
            markdown==null || markdown.length()>1_000_000 ||
            editor==null || editor.isBlank() || editor.length()>200 ||
            now==null) throw new IllegalArgumentException("Invalid page fields");
    }
    private static String safeFolder(String folderId) {
        return folderId == null || folderId.isBlank() ? "root" :
            folderId.matches("[A-Za-z0-9._-]{1,128}") ? folderId :
            throwInvalidFolder();
    }
    private static String throwInvalidFolder() {
        throw new IllegalArgumentException("Invalid folder identifier");
    }
}
