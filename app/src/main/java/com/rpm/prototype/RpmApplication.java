package com.rpm.prototype;

import android.app.*;
import android.os.Bundle;
import java.util.*;

/** The launcher floats over other apps, never over RPM's own composer or settings. */
public final class RpmApplication extends Application {
    private final Set<Activity> visible=Collections.newSetFromMap(new WeakHashMap<>());
    private final Map<Activity,Runnable> syncViews=new IdentityHashMap<>();
    private void pauseSync(Activity activity){Runnable view=syncViews.remove(activity);if(view!=null)PlannerSyncLifecycle.pause(view);}
    @Override public void onCreate(){super.onCreate();Diagnostics.initialize(this);registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks(){
        public void onActivityResumed(Activity a){visible.add(a);ButterflyService.appVisible(true);Runnable refresh=syncViews.computeIfAbsent(a,activity->()->{if(activity instanceof CompanionActivity)((CompanionActivity)activity).syncChanged();else if(activity instanceof CloudActivity)((CloudActivity)activity).updateStatus();});PlannerSyncLifecycle.resume(a,refresh);}
        public void onActivityPaused(Activity a){pauseSync(a);visible.remove(a);ButterflyService.appVisible(!visible.isEmpty());}
        public void onActivityDestroyed(Activity a){pauseSync(a);visible.remove(a);ButterflyService.appVisible(!visible.isEmpty());}
        public void onActivityCreated(Activity a,Bundle b){}
        public void onActivityStarted(Activity a){}
        public void onActivityStopped(Activity a){}
        public void onActivitySaveInstanceState(Activity a,Bundle b){}
    });}
}
