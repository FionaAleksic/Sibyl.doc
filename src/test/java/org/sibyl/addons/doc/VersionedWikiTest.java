package org.sibyl.addons.doc;
import java.time.*;
public final class VersionedWikiTest {
    public static void main(String[] args) {
        var store=new VersionedWiki();
        Instant now=Instant.parse("2026-10-12T00:00:00Z");
        var a=store.create("technik","Netzwerk","Initial","fiona",now);
        check(a.version()==1,"create");
        var b=store.edit(a.pageId(),1,"technik","Netzwerk","Update","fiona",now);
        check(b.version()==2 && store.history(a.pageId()).size()==2,"history");
        try { store.edit(a.pageId(),1,"technik","x","y","a",now);throw new AssertionError(); }
        catch(IllegalStateException expected) {}
        check(store.activePages().size()==1,"active");
        store.archive(a.pageId(),2,"admin",now);
        check(store.activePages().isEmpty() && store.history(a.pageId()).size()==3,"archive retained");
        try { store.edit(a.pageId(),3,"technik","x","y","a",now);throw new AssertionError(); }
        catch(IllegalStateException expected) {}
        System.out.println("VersionedWikiTest PASS");
    }
    private static void check(boolean v,String msg) {if(!v)throw new AssertionError(msg);}
}
