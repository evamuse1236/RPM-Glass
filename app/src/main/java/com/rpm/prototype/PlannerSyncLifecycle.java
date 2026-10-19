package com.rpm.prototype;

import android.content.Context;
import android.os.*;
import java.util.LinkedHashSet;
import java.util.Set;

final class PlannerSyncLifecycle {
    private static final Handler MAIN=new Handler(Looper.getMainLooper());
    private static final Set<Runnable> VIEWS=new LinkedHashSet<>();
    private static Context app;
    private static final Runnable POLL=new Runnable(){public void run(){if(VIEWS.isEmpty())return;refresh();MAIN.postDelayed(this,PlannerSyncProtocol.FOREGROUND_MS);}};
    private static final Runnable CHANGED=PlannerSyncLifecycle::refresh;
    static void resume(Context context,Runnable view){app=context.getApplicationContext();boolean first=VIEWS.isEmpty();VIEWS.add(view);if(first){MAIN.removeCallbacks(POLL);MAIN.post(POLL);}}
    static void pause(Runnable view){VIEWS.remove(view);if(VIEWS.isEmpty()){MAIN.removeCallbacks(POLL);MAIN.removeCallbacks(CHANGED);}}
    static void changed(Context context){MAIN.post(()->{app=context.getApplicationContext();MAIN.removeCallbacks(CHANGED);if(!VIEWS.isEmpty())MAIN.postDelayed(CHANGED,PlannerSyncProtocol.DEBOUNCE_MS);});}
    private static void refresh(){if(app!=null)SyncManager.now(app,()->{for(Runnable view:java.util.List.copyOf(VIEWS))view.run();});}
}
