package com.rpm.prototype;

import android.app.Application;
import android.content.Context;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28,application=Application.class)
public class BridgeOutcomeTest {
    private JSONObject store(int version)throws Exception{return new JSONObject("{schema:2,version:0,entries:[{id:1,title:'A',raw:'A',revisions:[]}],memories:[],history:[],conversations:[{}]}").put("version",version);}

    @Test public void aStaleSaveIsAConflictWithTheWordsThePageRetriesOn()throws Exception{
        Context context=RuntimeEnvironment.getApplication();
        CompanionStore.write(context,store(1),0);
        Exception clash=assertThrows(Exception.class,()->CompanionStore.write(context,store(2),0));
        assertEquals("Saved context changed. Reopen RPM before retrying.",clash.getMessage());
        assertEquals("conflict",BridgeCallRecord.outcomeOf(clash));
    }

    @Test public void noConnectionIsOfflineAndOnlyRealFaultsAreErrors(){
        assertEquals("offline",BridgeCallRecord.outcomeOf(new Offline("Voice needs the internet. Check the connection.")));
        assertEquals("cancelled",BridgeCallRecord.outcomeOf(new java.util.concurrent.CancellationException()));
        assertEquals("error",BridgeCallRecord.outcomeOf(new IllegalStateException("Voice is unavailable right now.")));
        assertEquals("error",BridgeCallRecord.outcomeOf(new java.io.IOException("disk full")));
    }
}
