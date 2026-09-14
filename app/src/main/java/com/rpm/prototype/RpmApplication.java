package com.rpm.prototype;

import android.app.*;
import android.os.Bundle;
import java.util.*;

/** The launcher floats over other apps, never over RPM's own composer or settings. */
public final class RpmApplication extends Application {
    private final Set<Activity> visible=Collections.newSetFromMap(new WeakHashMap<>());
    @Override public void onCreate(){super.onCreate();registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks(){
        public void onActivityResumed(Activity a){visible.add(a);ButterflyService.appVisible(true);}
        public void onActivityPaused(Activity a){visible.remove(a);ButterflyService.appVisible(!visible.isEmpty());}
        public void onActivityDestroyed(Activity a){visible.remove(a);ButterflyService.appVisible(!visible.isEmpty());}
        public void onActivityCreated(Activity a,Bundle b){}
        public void onActivityStarted(Activity a){}
        public void onActivityStopped(Activity a){}
        public void onActivitySaveInstanceState(Activity a,Bundle b){}
    });}
}
