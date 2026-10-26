package com.rpm.prototype;

import static org.junit.Assert.assertEquals;

import org.json.JSONObject;
import org.junit.Test;

public class SyncStatusTest {
    @Test public void aStoreThatNeverSyncedSaysSo() throws Exception {
        assertEquals("Planner not synced yet", SyncStatus.planner(new JSONObject("{\"version\":3}"), 0));
    }

    @Test public void noStampsAndNoOutboxMeansSynced() throws Exception {
        assertEquals("Planner synced", SyncStatus.planner(new JSONObject("{\"sync\":{\"base\":{},\"stamps\":{},\"outbox\":null}}"), 0));
    }

    @Test public void stampedRecordsAndOutboxChangesCountOnce() throws Exception {
        JSONObject data = new JSONObject("{\"sync\":{\"base\":{},\"stamps\":{\"task:1\":{\"title\":\"x\"},\"task:2\":{}},"
            + "\"outbox\":{\"changes\":[{\"key\":\"task:1\"},{\"key\":\"block:a\"}]}}}");
        assertEquals("3 planner changes waiting to sync · 2 earlier changes queued", SyncStatus.planner(data, 2));
    }
}
