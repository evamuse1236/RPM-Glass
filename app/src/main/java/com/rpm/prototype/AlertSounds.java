package com.rpm.prototype;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.provider.Settings;
import java.io.*;
import java.util.UUID;

/** Alarm files are private copies. Android remains the owner of notification sounds. */
final class AlertSounds {
    private static final String PREFS="alert-sounds";
    private static final long MAX_BYTES=25L*1024*1024;
    private static SharedPreferences prefs(Context c){return c.getSharedPreferences(PREFS,0);}
    static Uri defaultAlarm(){return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);}
    static Uri alarm(Context c){String value=prefs(c).getString("alarm-uri",null);return value==null?defaultAlarm():Uri.parse(value);}
    static String alarmName(Context c){return prefs(c).getString("alarm-name","Phone default");}
    static Intent alarmPicker(Context c){String picked=prefs(c).getString("alarm-picker-uri",null);return new Intent(RingtoneManager.ACTION_RINGTONE_PICKER)
        .putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE,RingtoneManager.TYPE_ALARM)
        .putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE,"Alarm sound")
        .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT,false)
        .putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT,true)
        .putExtra(RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI,defaultAlarm())
        .putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI,picked!=null?Uri.parse(picked):prefs(c).contains("alarm-uri")?null:defaultAlarm());}
    static String title(Context c,Uri uri){
        if(uri==null)return "Silent";
        if(RingtoneManager.isDefault(uri))return "Phone default";
        try{Ringtone tone=RingtoneManager.getRingtone(c,uri);if(tone!=null){String name=tone.getTitle(c);if(name!=null&&!name.isBlank())return name;}}catch(RuntimeException ignored){}
        return "Selected sound";
    }
    static String reminderName(Context c,String id){NotificationChannel channel=c.getSystemService(NotificationManager.class).getNotificationChannel(id);
        if(channel==null)return "Phone default";
        if(channel.getImportance()==NotificationManager.IMPORTANCE_NONE)return "Notifications off";
        if(channel.getImportance()<NotificationManager.IMPORTANCE_DEFAULT||channel.getSound()==null)return "Silent";
        return title(c,channel.getSound());
    }
    static Intent reminderSettings(Context c,String id){return new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE,c.getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID,id);}
    static synchronized void useDefault(Context c)throws IOException{
        Uri old=alarm(c);if(!prefs(c).edit().remove("alarm-uri").remove("alarm-name").remove("alarm-picker-uri").commit())throw new IOException("Could not save sound.");removeOldCopy(c,old);
    }
    /** Called off the UI thread. Validate before changing the saved choice. */
    static synchronized void importAlarm(Context c,Uri source,boolean phoneTone)throws IOException{
        if(source==null)throw new IOException("Choose an audio file.");
        if(RingtoneManager.isDefault(source)){useDefault(c);return;}
        String name=phoneTone?title(c,source):"My audio file";
        if(!phoneTone)try(Cursor cursor=c.getContentResolver().query(source,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){
            if(cursor!=null&&cursor.moveToFirst()&&!cursor.isNull(0))name=cursor.getString(0);
        }catch(RuntimeException ignored){}
        File copy=new File(c.getFilesDir(),"alarm-sound-"+UUID.randomUUID()+".audio");boolean saved=false;
        try{
            try(InputStream in=c.getContentResolver().openInputStream(source);FileOutputStream out=new FileOutputStream(copy)){
                if(in==null)throw new IOException("Could not open that audio file.");byte[] buffer=new byte[32768];long size=0;int n;
                while((n=in.read(buffer))!=-1){size+=n;if(size>MAX_BYTES)throw new IOException("Choose an audio file smaller than 25 MB.");out.write(buffer,0,n);}out.getFD().sync();
                if(size==0)throw new IOException("That audio file is empty.");
            }
            MediaPlayer check=new MediaPlayer();try{check.setDataSource(copy.getAbsolutePath());check.prepare();if(check.getDuration()<=0)throw new IOException("Choose a playable audio file.");}
            catch(RuntimeException e){throw new IOException("That audio file could not be played. Try MP3, WAV or OGG.",e);}finally{check.release();}
            Uri old=alarm(c);if(!prefs(c).edit().putString("alarm-uri",Uri.fromFile(copy).toString()).putString("alarm-name",name).putString("alarm-picker-uri",phoneTone?source.toString():null).commit())throw new IOException("Could not save sound.");
            saved=true;removeOldCopy(c,old);
        }finally{if(!saved)copy.delete();}
    }
    private static void removeOldCopy(Context c,Uri old){if(old!=null&&"file".equals(old.getScheme())){File f=new File(old.getPath());if(f.getParentFile().equals(c.getFilesDir())&&f.getName().startsWith("alarm-sound-"))f.delete();}}

    /** Async decoding keeps the alarm controls responsive; a missing file falls back once. */
    static MediaPlayer playAlarm(Context c,AudioAttributes attributes,Runnable failed){
        MediaPlayer p=new MediaPlayer();p.setAudioAttributes(attributes);p.setLooping(true);boolean[] fallback={false};
        Runnable useFallback=()->{if(fallback[0]){failed.run();return;}fallback[0]=true;try{p.reset();p.setAudioAttributes(attributes);p.setLooping(true);p.setDataSource(c,defaultAlarm());p.prepareAsync();}catch(Exception e){failed.run();}};
        p.setOnPreparedListener(player->player.start());p.setOnErrorListener((player,what,extra)->{useFallback.run();return true;});
        try{p.setDataSource(c,alarm(c));p.prepareAsync();}catch(Exception e){useFallback.run();}return p;
    }
}
