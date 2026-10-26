package com.rpm.prototype;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public final class DebugPairReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        PendingResult pending=goAsync();
        Context app=context.getApplicationContext();
        String url=intent.getStringExtra("url"),code=intent.getStringExtra("code");
        SyncManager.EXECUTOR.execute(()->{
            try{SyncManager.pair(app,url==null?"":url,code==null?"":code);Log.i("RpmDebugPair","paired");pending.setResultCode(1);}
            catch(Exception e){Log.w("RpmDebugPair","pair failed: "+e.getClass().getSimpleName());pending.setResultCode(2);}
            finally{pending.finish();}
        });
    }
}
