package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.media.*;
import android.os.*;
import android.net.Uri;
import org.json.JSONObject;
import java.util.*;

public final class AlarmService extends Service {
    static volatile boolean running=false;
    private static final int NOTIFICATION=4301;
    private final LinkedHashMap<Long,Long> active=new LinkedHashMap<>();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;
    private AudioFocusRequest focus;
    @Override public void onCreate(){super.onCreate();running=true;Alarms.channel(this);}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        long id=intent.getLongExtra("id",-1);String action=intent.getAction();
        if("STOP".equals(action)||"SNOOZE".equals(action)){finishAlarm(id,"SNOOZE".equals(action));return START_NOT_STICKY;}
        try(Store s=new Store(this)){
            JSONObject e=s.get(id);
            if(!e.optString("alarm_status").equals("scheduled")||e.optLong("alarm")>System.currentTimeMillis()+1000){if(active.isEmpty())stopSelf();return START_NOT_STICKY;}
            // Start foreground immediately before preparing sound or doing further work.
            startForeground(NOTIFICATION,notification(id,e.optString("title"),true));
            long startedAt=SystemClock.elapsedRealtime();active.put(id,startedAt);ContentValues v=new ContentValues();v.put("alarm_status","ringing");s.update(id,v,"Local ringing alarm started");
            if(player==null)startSound();else if(wakeLock!=null)wakeLock.acquire(11*60*1000L);
            handler.postDelayed(()->{if(active.containsKey(id)&&active.get(id)==startedAt){recordEnd(id,"timed_out","Alarm auto-stopped after 10 minutes");active.remove(id);refreshOrStop();}},10*60*1000);
        }catch(Exception ex){active.remove(id);try(Store s=new Store(this)){ContentValues v=new ContentValues();v.put("alarm_status","failed");s.update(id,v,"Alarm could not start");}catch(Exception ignored){}refreshOrStop();}
        return START_NOT_STICKY;
    }
    private PendingIntent action(long id,String name){Intent i=new Intent(this,AlarmService.class).setAction(name).setData(Uri.parse("rpm://alarm-action/"+name+"/"+id)).putExtra("id",id);return PendingIntent.getService(this,0,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private Notification notification(long id,String title,boolean fullScreen){
        Notification.Builder b=new Notification.Builder(this,Alarms.CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(title)
            .setContentText(active.size()>1?"Multiple alarms · tap to manage":"Ringing alarm · snooze or dismiss").setCategory(Notification.CATEGORY_ALARM)
            .setOngoing(true).setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(Alarms.open(this,id))
            .addAction(new Notification.Action.Builder(null,"Snooze 10 min",action(id,"SNOOZE")).build())
            .addAction(new Notification.Action.Builder(null,"Dismiss",action(id,"STOP")).build());
        if(fullScreen&&Alarms.fullScreenAllowed(this))b.setFullScreenIntent(Alarms.open(this,id),true);
        return b.build();
    }
    private void startSound()throws Exception{
        wakeLock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"rpm:alarm");wakeLock.setReferenceCounted(false);wakeLock.acquire(11*60*1000L);
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(change->{}).build();getSystemService(AudioManager.class).requestAudioFocus(focus);
        player=AlertSounds.playAlarm(this,attributes,()->handler.post(()->{for(long id:new ArrayList<>(active.keySet()))recordEnd(id,"failed","Alarm audio unavailable; check sound settings");active.clear();refreshOrStop();}));
        vibrator=getSystemService(Vibrator.class);if(vibrator!=null&&vibrator.hasVibrator())vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0,600,400,600,1000},0),attributes);
    }
    private void recordEnd(long id,String status,String reason){try(Store s=new Store(this)){ContentValues v=new ContentValues();v.put("alarm_status",status);s.update(id,v,reason);}}
    private void finishAlarm(long id,boolean snooze){
        if(!active.containsKey(id)){if(active.isEmpty())stopSelf();return;}
        if(snooze){long at=System.currentTimeMillis()+10*60*1000;
            try(Store s=new Store(this)){Alarms.schedule(this,id,at);ContentValues v=new ContentValues();v.put("alarm",at);v.put("alarm_status","scheduled");s.update(id,v,"User snoozed alarm for 10 minutes");}
            catch(Exception ex){recordEnd(id,"permission_needed","Snooze unavailable: alarm permission needed");android.widget.Toast.makeText(this,"Snooze could not be set. Check alarm permission.",android.widget.Toast.LENGTH_LONG).show();}
        }else recordEnd(id,"dismissed","User dismissed ringing alarm");
        active.remove(id);refreshOrStop();
    }
    private void refreshOrStop(){if(active.isEmpty()){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}else{long next=active.keySet().iterator().next();try(Store s=new Store(this)){startForeground(NOTIFICATION,notification(next,s.get(next).optString("title"),false));}}}
    @Override public void onDestroy(){
        handler.removeCallbacksAndMessages(null);if(player!=null){player.release();player=null;}if(vibrator!=null)vibrator.cancel();if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();if(focus!=null)getSystemService(AudioManager.class).abandonAudioFocusRequest(focus);
        for(long id:active.keySet())recordEnd(id,"interrupted","Alarm service ended before dismissal");active.clear();running=false;super.onDestroy();
    }
}
