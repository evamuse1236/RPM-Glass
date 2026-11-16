package com.rpm.prototype;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.json.JSONObject;
import org.junit.Test;

public class CompanionStoreLoadTest {
    private static JSONObject stored(int version) throws Exception { return new JSONObject().put("schema", 2).put("version", version); }

    @Test public void theSameVersionIsAnsweredUnchanged() throws Exception {
        assertTrue(CompanionStore.unchanged(stored(7), new JSONObject().put("known", 7)));
    }

    @Test public void aNewerVersionOrNoKnownVersionSendsTheData() throws Exception {
        assertFalse(CompanionStore.unchanged(stored(8), new JSONObject().put("known", 7)));
        assertFalse(CompanionStore.unchanged(stored(7), new JSONObject()));
        assertFalse(CompanionStore.unchanged(null, new JSONObject().put("known", 0)));
    }

    // An import or restore promises "Your current copy will be backed up privately first": the backup must be
    // on disk (fsynced) before writeRaw durably replaces companion.json, and a failed backup leaves no partial file.
    @Test public void theImportBackupIsDurableBeforeTheMainFileIsReplaced() throws Exception {
        String src = new String(Files.readAllBytes(Paths.get("src/main/java/com/rpm/prototype/CompanionStore.java")), StandardCharsets.UTF_8);
        int start = src.indexOf("static void importCopy(Context c,JSONObject d,long sourceModifiedAt)");
        assertTrue("importCopy not found", start >= 0);
        int backup = src.indexOf("companion-before-import-", start);
        int replace = src.indexOf("writeRaw(c,d);", start);
        assertTrue("backup must be written before the main file", backup > start && replace > backup);
        String between = src.substring(backup, replace);
        assertTrue("the backup is not fsynced before writeRaw replaces companion.json", between.contains("getFD().sync()"));
        assertTrue("a failed backup write must delete the partial file", between.contains("backup.delete()"));
    }
}
