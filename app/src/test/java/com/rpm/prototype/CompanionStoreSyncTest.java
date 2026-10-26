package com.rpm.prototype;

import android.app.Application;
import android.content.Context;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.time.Instant;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=Application.class)
public class CompanionStoreSyncTest {
    private Context context;
    @Before public void setup(){context=RuntimeEnvironment.getApplication();}
    private JSONObject store(int version)throws Exception{return new JSONObject("{schema:2,version:0,entries:[{id:1,title:'Original',raw:'Original',revisions:[]}],memories:[],history:[],conversations:[{}]}").put("version",version);}
    @Test public void localWritesStampInTheAtomicStoreAndSyncWritesDoNot()throws Exception {
        CompanionStore.write(context,store(1),0);
        JSONObject old=CompanionStore.read(context);String at=old.getJSONObject("sync").getJSONObject("stamps").getJSONObject("task:1").getString("title");
        JSONObject next=SyncStampsTest.copy(old).put("version",2);next.getJSONArray("entries").getJSONObject(0).put("title","From server");
        CompanionStore.write(context,next,1,"sync");JSONObject saved=CompanionStore.read(context);
        assertEquals("From server",saved.getJSONArray("entries").getJSONObject(0).getString("title"));
        SyncStampsTest.assertJson(old.getJSONObject("sync"),saved.getJSONObject("sync"));
        next=SyncStampsTest.copy(saved).put("version",3);next.getJSONArray("entries").getJSONObject(0).put("notes","Local note");
        CompanionStore.write(context,next,2,"local");JSONObject groups=CompanionStore.read(context).getJSONObject("sync").getJSONObject("stamps").getJSONObject("task:1");
        assertEquals(at,groups.getString("title"));assertTrue(groups.has("notes"));
    }
    @Test public void syncWriteOnAFreshStoreCreatesNoStampsAndCasFailureDoesNotSave()throws Exception {
        CompanionStore.write(context,store(1),0,"sync");assertFalse(CompanionStore.read(context).has("sync"));
        JSONObject next=store(3);assertThrows(java.io.IOException.class,()->CompanionStore.write(context,next,0));
        assertFalse(next.has("sync"));assertEquals(1,CompanionStore.read(context).getInt("version"));
    }
    @Test public void successiveSavesKeepNativeStampsMissingFromTheWebViewsCachedData()throws Exception {
        CompanionStore.write(context,store(1),0);JSONObject first=CompanionStore.read(context);
        JSONObject cached=store(2);cached.getJSONArray("entries").getJSONObject(0).put("notes","Second edit");
        CompanionStore.write(context,cached,1);JSONObject groups=CompanionStore.read(context).getJSONObject("sync").getJSONObject("stamps").getJSONObject("task:1");
        assertEquals(first.getJSONObject("sync").getJSONObject("stamps").getJSONObject("task:1").getString("title"),groups.getString("title"));
        assertTrue(groups.has("notes"));
    }
    @Test public void restoreKeepsLiveSyncAndUsesTheBackupSavedTime()throws Exception {
        JSONObject live=store(1).put("sync",new JSONObject("{cursor:17,seq:9,nextTaskId:55,base:{kept:{rev:8}},outbox:{seq:9},remoteActivity:{},stamps:{'task:1':{raw:'untouched'}}}"));
        CompanionStore.write(context,live,0,"sync");JSONObject before=CompanionStore.read(context).getJSONObject("sync");
        JSONObject backup=store(40).put("syncSavedAt","2026-10-01T00:00:00Z").put("sync",new JSONObject("{cursor:999,seq:999}"));
        backup.getJSONArray("entries").getJSONObject(0).put("title","Old backup title");
        Instant start=Instant.now();CompanionStore.importCopy(context,backup);JSONObject saved=CompanionStore.read(context),sync=saved.getJSONObject("sync");
        assertEquals(2,saved.getInt("version"));assertEquals(17,sync.getInt("cursor"));
        for(String key:new String[]{"seq","nextTaskId","base","outbox","remoteActivity"})assertEquals(before.get(key).toString(),sync.get(key).toString());
        assertEquals("2026-10-01T00:00:00Z",sync.getJSONObject("stamps").getJSONObject("task:1").getString("title"));
        assertEquals("untouched",sync.getJSONObject("stamps").getJSONObject("task:1").getString("raw"));
        assertFalse(Instant.parse(sync.getString("restoredAt")).isBefore(start));
    }
    @Test public void restoreWithoutSavedTimeUsesSourceFileTimeAndRejectsBackupSync()throws Exception {
        JSONObject backup=store(40).put("sync",new JSONObject("{cursor:999}"));
        CompanionStore.importCopy(context,backup,Instant.parse("2026-09-01T00:00:00Z").toEpochMilli());
        JSONObject sync=CompanionStore.read(context).getJSONObject("sync");assertFalse(sync.has("cursor"));
        assertEquals("2026-09-01T00:00:00Z",sync.getJSONObject("stamps").getJSONObject("task:1").getString("title"));assertTrue(sync.has("restoredAt"));
    }
    @Test public void syncWritesDoNotScheduleAnotherSyncButLocalEditsDo()throws Exception {
        SyncManager.prefs(context).edit().putString("url","https://test.convex.site").putString("token","fixture").commit();
        android.app.job.JobScheduler scheduler=context.getSystemService(android.app.job.JobScheduler.class);
        scheduler.cancelAll();
        CompanionStore.write(context,store(1),0,"sync");assertNull(scheduler.getPendingJob(7401));
        CompanionStore.write(context,store(2),1,"local");assertNotNull(scheduler.getPendingJob(7401));
    }
    @Test public void packagedContractMatchesTheGoldenContract()throws Exception {
        try(var in=context.getAssets().open("sync/records.json")){
            SyncStampsTest.assertJson(SyncStampsTest.json("web/contract/records.json"),new JSONObject(CompanionStore.readText(in)));
        }
    }
}
