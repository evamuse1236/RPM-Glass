package com.rpm.prototype;
import android.content.*;
public final class CompanionAlertReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c,Intent i){if(CompanionAlerts.FIRE.equals(i.getAction())){try{CompanionAlerts.fired(c,i.getLongExtra("id",-1),i.getLongExtra("at",-1));}catch(Exception ignored){}}else CompanionAlerts.restore(c);}
}
