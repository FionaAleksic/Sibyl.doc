package de.nikoit.sibyl.addons;

import java.security.Principal;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/addons/{addonId}/documents")
public class AddonDocumentsController {
    public record Document(long id,String addonId,String ownerUsername,String title,String body,String updatedAt) {}
    public record DocumentInput(String title,String body) {}
    private final JdbcTemplate db;
    private final AddonRegistry addons;
    private final AuditService audit;
    private final AddonConfigurationService settings;
    public AddonDocumentsController(JdbcTemplate db,AddonRegistry addons,AuditService audit,
                                    AddonConfigurationService settings) {
        this.db=db;this.addons=addons;this.audit=audit;this.settings=settings;
    }
    private static final String FIELDS="SELECT id,addon_id,owner_username,title,body,updated_at FROM sibyl_addon_documents ";
    private List<Document> select(String sql,Object... params) {
        return db.query(sql,(rs,i)->new Document(rs.getLong("id"),rs.getString("addon_id"),
            rs.getString("owner_username"),rs.getString("title"),rs.getString("body"),
            rs.getTimestamp("updated_at").toInstant().toString()),params);
    }
    @GetMapping
    public List<Document> list(@PathVariable String addonId, Authentication who) {
        AddonRegistry.Addon addon=docsAddon(addonId,who);
        if (addon.documentMode().equals("personal")) {
            return select(FIELDS+"WHERE addon_id=? AND owner_username=? ORDER BY updated_at DESC",addonId,who.getName());
        }
        return select(FIELDS+"WHERE addon_id=? ORDER BY updated_at DESC",addonId);
    }
    private AddonRegistry.Addon docsAddon(String addonId,Authentication who) {
        AddonRegistry.Addon addon=addons.accessible(addonId,who);
        if (!addon.moduleType().equals("documents")) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Document provider not available");
        return addon;
    }
    private void checkWrite(AddonRegistry.Addon addon,Authentication who) {
        if (addon.documentMode().equals("shared") && !addons.isAdmin(who)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Only administrators may edit shared documents");
        }
    }
    private void validate(String addonId,DocumentInput input) {
        if (input==null || input.title()==null || input.title().isBlank() || input.title().length()>255
                || input.body()==null || input.body().length()>settings.integerValue(addonId,"maxBodyLength")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid title or content");
        }
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public void create(@PathVariable String addonId,@RequestBody DocumentInput input,Authentication who) {
        AddonRegistry.Addon addon=docsAddon(addonId,who);
        checkWrite(addon,who);validate(addonId,input);
        db.update("INSERT INTO sibyl_addon_documents(addon_id,owner_username,title,body) VALUES(?,?,?,?)",
            addonId,who.getName(),input.title().trim(),input.body());
        audit.record(who.getName(),"DOCUMENT_CREATE",addonId);
    }
    @PutMapping("/{id}")
    @Transactional
    public void update(@PathVariable String addonId,@PathVariable long id,
                       @RequestBody DocumentInput input,Authentication who) {
        AddonRegistry.Addon addon=docsAddon(addonId,who);
        checkWrite(addon,who);validate(addonId,input);
        String sql="UPDATE sibyl_addon_documents SET title=?,body=? WHERE id=? AND addon_id=?";
        int count=addon.documentMode().equals("personal")
            ?db.update(sql+" AND owner_username=?",input.title().trim(),input.body(),id,addonId,who.getName())
            :db.update(sql,input.title().trim(),input.body(),id,addonId);
        if(count==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found");
        audit.record(who.getName(),"DOCUMENT_UPDATE",addonId+":"+id);
    }
    @DeleteMapping("/{id}")
    @Transactional
    public void delete(@PathVariable String addonId,@PathVariable long id,Authentication who) {
        AddonRegistry.Addon addon=docsAddon(addonId,who);
        checkWrite(addon,who);
        String sql="DELETE FROM sibyl_addon_documents WHERE addon_id=? AND id=?";
        int count=addon.documentMode().equals("personal")
            ?db.update(sql+" AND owner_username=?",addonId,id,who.getName())
            :db.update(sql,addonId,id);
        if(count==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Document not found");
        audit.record(who.getName(),"DOCUMENT_DELETE",addonId+":"+id);
    }
}
