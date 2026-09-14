package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.media.*;
import android.net.Uri;
import android.provider.Settings;
import java.io.*;
import java.nio.*;
import java.util.concurrent.atomic.*;

/** Only synthetic audio and an isolated preference namespace are changed. */
final class SoundChecks {
    private static int count;
    private static void check(boolean good,String message){count++;if(!good)throw new AssertionError(message);}
    static int run(Instrumentation test,Context c)throws Exception{
        File source=new File(c.getFilesDir(),"test-tone.wav"),bad=new File(c.getFilesDir(),"test-empty.wav");
        MediaPlayer[] playing={null};File imported=null;
        try{
            int samples=8000,bytes=samples*2;ByteBuffer wav=ByteBuffer.allocate(44+bytes).order(ByteOrder.LITTLE_ENDIAN);
            wav.put("RIFF".getBytes()).putInt(36+bytes).put("WAVEfmt ".getBytes()).putInt(16).putShort((short)1).putShort((short)1).putInt(8000).putInt(16000).putShort((short)2).putShort((short)16).put("data".getBytes()).putInt(bytes);
            for(int i=0;i<samples;i++)wav.putShort((short)(Math.sin(i*2*Math.PI*440/8000)*500));
            try(FileOutputStream out=new FileOutputStream(source)){out.write(wav.array());}
            AlertSounds.importAlarm(c,Uri.fromFile(source),false);Uri selected=AlertSounds.alarm(c);imported=new File(selected.getPath());
            check(imported.exists()&&!imported.equals(source),"selected audio is a private copy");
            source.delete();check(imported.exists(),"moving original does not break selected alarm");
            try(FileOutputStream out=new FileOutputStream(bad)){out.write(new byte[0]);}
            try{AlertSounds.importAlarm(c,Uri.fromFile(bad),false);throw new AssertionError("empty audio accepted");}catch(IOException expected){check(AlertSounds.alarm(c).equals(selected),"failed import preserves previous sound");}
            AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build();AtomicBoolean failed=new AtomicBoolean();
            test.runOnMainSync(()->playing[0]=AlertSounds.playAlarm(c,attributes,()->failed.set(true)));
            check(waitPlaying(test,playing)&&!failed.get(),"selected custom audio actually plays");test.runOnMainSync(()->{playing[0].release();playing[0]=null;});
            c.getSharedPreferences("alert-sounds",0).edit().putString("alarm-uri",Uri.fromFile(new File(c.getFilesDir(),"missing-tone.audio")).toString()).commit();
            test.runOnMainSync(()->playing[0]=AlertSounds.playAlarm(c,attributes,()->failed.set(true)));
            check(waitPlaying(test,playing)&&!failed.get(),"unreadable selection plays phone default fallback");test.runOnMainSync(()->{playing[0].release();playing[0]=null;});
            AlertSounds.useDefault(c);check(AlertSounds.alarm(c).equals(AlertSounds.defaultAlarm()),"default choice persists");
            CompanionAlerts.channels(c);NotificationManager manager=c.getSystemService(NotificationManager.class);NotificationChannel before=manager.getNotificationChannel(CompanionAlerts.REMINDERS);Uri sound=before.getSound();int importance=before.getImportance();
            CompanionAlerts.channels(c);NotificationChannel after=manager.getNotificationChannel(CompanionAlerts.REMINDERS);
            check(java.util.Objects.equals(sound,after.getSound())&&importance==after.getImportance(),"existing notification sound and blocked/silent choice preserved");
            Intent target=AlertSounds.reminderSettings(c,CompanionAlerts.REMINDERS);check(target.getAction().equals(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)&&target.getStringExtra(Settings.EXTRA_CHANNEL_ID).equals(CompanionAlerts.REMINDERS),"reminder row targets its own channel");
            check(manager.getNotificationChannel(CompanionAlerts.ALARMS).getSound()==null,"ringing alarm notification does not double-play a notification sound");
            return count;
        }finally{test.runOnMainSync(()->{if(playing[0]!=null)playing[0].release();});source.delete();bad.delete();if(imported!=null)imported.delete();c.getSharedPreferences("alert-sounds",0).edit().clear().commit();}
    }
    private static boolean waitPlaying(Instrumentation test,MediaPlayer[] player)throws InterruptedException{AtomicBoolean result=new AtomicBoolean();for(int i=0;i<50;i++){test.runOnMainSync(()->{try{result.set(player[0].isPlaying());}catch(IllegalStateException ignored){}});if(result.get())return true;Thread.sleep(100);}return false;}
}
