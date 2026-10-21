package com.rpm.prototype;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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
}
