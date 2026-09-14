package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import org.json.*;

public final class CompanionRingingActivity extends Activity {
    private final BroadcastReceiver updates=new BroadcastReceiver(){public void onReceive(Context c,Intent i){render();}};
    @android.annotation.SuppressLint("UnspecifiedRegisterReceiverFlag") // Pre-33 registration has no such flag; broadcast is package-scoped.
    @Override public void onCreate(Bundle saved){super.onCreate(saved);if(android.os.Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true);}else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED|WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(android.os.Build.VERSION.SDK_INT>=33)registerReceiver(updates,new IntentFilter("com.rpm.prototype.COMPANION_RING_CHANGED"),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(updates,new IntentFilter("com.rpm.prototype.COMPANION_RING_CHANGED"));render();}
    @Override protected void onNewIntent(Intent i){super.onNewIntent(i);setIntent(i);render();}
    private void render(){LinearLayout box=CompanionSettingsActivity.column(this);TextView heading=CompanionSettingsActivity.text(this,"Time for your plan",26);box.addView(heading);java.util.Set<Long> ids=CompanionAlarmService.activeIds();if(ids.isEmpty()){finish();return;}for(long id:ids){String title="RPM alarm";try{JSONObject d=CompanionStore.read(this),e=d==null?null:CompanionAlerts.entry(d,id);if(e!=null)title=e.optString("title");}catch(Exception ignored){}box.addView(CompanionSettingsActivity.text(this,title,22));for(String action:new String[]{"snooze","dismiss"}){Button b=CompanionSettingsActivity.button(this,action.equals("snooze")?"Snooze · 10 minutes":"Dismiss");b.setOnClickListener(v->{startService(new Intent(this,CompanionAlarmService.class).setAction(action).putExtra("id",id));});box.addView(b);}}ScrollView scroll=new ScrollView(this);scroll.setBackgroundColor(0xff121821);scroll.setFillViewport(true);scroll.addView(box);setContentView(scroll);scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});}
    @Override public void onDestroy(){unregisterReceiver(updates);super.onDestroy();}
}
