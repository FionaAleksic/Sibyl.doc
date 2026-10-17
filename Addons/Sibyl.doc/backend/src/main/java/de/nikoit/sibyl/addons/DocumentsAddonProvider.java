package de.nikoit.sibyl.addons;
import java.util.List;
import org.springframework.stereotype.Component;
@Component
public class DocumentsAddonProvider implements SibylAddonProvider {
    @Override public String type(){return "documents";}
    @Override public List<AddonConfigurationService.Field> settings(){
        return List.of(new AddonConfigurationService.Field(
            "maxBodyLength","Maximale Zeichen pro Notiz","number",
            "Grenze wird serverseitig beim Speichern geprüft.","100000",100,100000,List.of()));
    }
}
