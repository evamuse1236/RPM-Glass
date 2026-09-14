package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.os.*;
import org.json.*;
import java.util.*;

public final class CompanionAlarmService extends Service {
    private static CompanionAlarmService running;
    private final java.util.concurrent.ConcurrentHashMap<Long,Long> active=new java.util.concurrent.ConcurrentHashMap<>();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private MediaPlayer player;private PowerManager.WakeLock wake;private Vibrator vibrator;private AudioFocusRequest focus;
    static void cancelActive(long id){CompanionAlarmService s=running;if(s!=null)s.handler.post(()->s.remove(id,false,false,"Alert changed"));}
    @Override public void onCreate(){super.onCreate();running=this;CompanionAlerts.channels(this);}
    @Override public IBinder onBind(Intent i){return null;}
    @Override public int onStartCommand(Intent i,int flags,int startId){
        if(i==null){stopSelf();return START_NOT_STICKY;}long id=i.getLongExtra("id",-1);String action=i.getAction();
        if("dismiss".equals(action)||"snooze".equals(action)){remove(id,"snooze".equals(action),true,"Alarm dismissed");return START_NOT_STICKY;}
        try{JSONObject d=CompanionStore.read(this),e=d==null?null:CompanionAlerts.entry(d,id),r=CompanionAlerts.ledger(this).optJSONObject(String.valueOf(id));if(e==null||r==null||!CompanionAlerts.active(e)||!r.optString("status").equals("ringing")){if(active.isEmpty())stopSelf();return START_NOT_STICKY;}
            active.putIfAbsent(id,SystemClock.elapsedRealtime());startForeground(81001,notification());if(player==null)startSound();handler.removeCallbacks(expire);handler.postDelayed(expire,1000);
        }catch(Exception e){try{CompanionAlerts.finish(this,id,false,"Alarm audio could not start");}catch(Exception ignored){}active.remove(id);if(active.isEmpty())stopSelf();}
        return START_NOT_STICKY;
    }
    private final Runnable expire=new Runnable(){public void run(){for(long id:new ArrayList<>(active.keySet()))if(SystemClock.elapsedRealtime()-active.get(id)>=600000)remove(id,false,true,"Alarm stopped after 10 minutes");if(!active.isEmpty())handler.postDelayed(this,1000);}};
    private PendingIntent action(long id,String action){return PendingIntent.getService(this,0,new Intent(this,CompanionAlarmService.class).setAction(action).setData(Uri.parse("rpm-companion://"+action+"/"+id)).putExtra("id",id),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private Notification notification(){long id=active.keySet().iterator().next();String title="RPM alarm";try{JSONObject e=CompanionAlerts.entry(CompanionStore.read(this),id);if(e!=null)title=e.optString("title",title);}catch(Exception ignored){}
        PendingIntent screen=PendingIntent.getActivity(this,0,new Intent(this,CompanionRingingActivity.class).putExtra("id",id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=new Notification.Builder(this,CompanionAlerts.ALARMS).setSmallIcon(R.drawable.ic_checkin).setContentTitle(title).setContentText(active.size()>1?active.size()+" RPM alarms · open to manage":"It's time · Snooze for 10 minutes or dismiss").setCategory(Notification.CATEGORY_ALARM).setOngoing(true).setVisibility(Notification.VISIBILITY_PUBLIC).setContentIntent(screen).addAction(new Notification.Action.Builder(null,"Snooze 10 min",action(id,"snooze")).build()).addAction(new Notification.Action.Builder(null,"Dismiss",action(id,"dismiss")).build());
        if(Build.VERSION.SDK_INT<34||getSystemService(NotificationManager.class).canUseFullScreenIntent())b.setFullScreenIntent(screen,true);return b.build();
    }
    private void startSound()throws Exception{
        AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
        AudioManager am=getSystemService(AudioManager.class);focus=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(change->{if(player!=null){if(change==AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK)player.setVolume(.3f,.3f);else if(change==AudioManager.AUDIOFOCUS_GAIN)player.setVolume(1f,1f);}}).build();am.requestAudioFocus(focus);
        player=AlertSounds.playAlarm(this,attributes,()->handler.post(()->{for(long id:new ArrayList<>(active.keySet()))remove(id,false,true,"Alarm audio unavailable · check sound settings");}));
        vibrator=getSystemService(Vibrator.class);if(vibrator!=null)vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0,500,600,500,1200},0),attributes);
        wake=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"rpm:companion-alarm");wake.acquire(660000);
    }
    private void remove(long id,boolean snooze,boolean update,String label){if(active.remove(id)==null)return;if(update)try{CompanionAlerts.finish(this,id,snooze,label);}catch(Exception ignored){}if(active.isEmpty()){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}else getSystemService(NotificationManager.class).notify(81001,notification());sendBroadcast(new Intent("com.rpm.prototype.COMPANION_RING_CHANGED").setPackage(getPackageName()));}
    static Set<Long> activeIds(){return running==null?Set.of():new LinkedHashSet<>(running.active.keySet());}
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(player!=null){player.release();player=null;}if(vibrator!=null)vibrator.cancel();if(wake!=null&&wake.isHeld())wake.release();if(focus!=null)getSystemService(AudioManager.class).abandonAudioFocusRequest(focus);for(long id:active.keySet())try{CompanionAlerts.finish(this,id,false,"Alarm interrupted · check phone settings");}catch(Exception ignored){}active.clear();if(running==this)running=null;super.onDestroy();}
}
