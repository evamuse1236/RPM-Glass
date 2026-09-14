package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.provider.Settings;
import android.widget.*;
import org.json.JSONObject;
import java.util.*;

final class EntryDialogs {
    interface TimeChosen {void chosen(long at);}
    static void time(Activity a, long initial, TimeChosen callback) {
        Calendar c=Calendar.getInstance(); c.setTimeInMillis(initial);
        new DatePickerDialog(a,(v,y,m,d)->{c.set(y,m,d);
            new TimePickerDialog(a,(view,h,min)->{c.set(Calendar.HOUR_OF_DAY,h);c.set(Calendar.MINUTE,min);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);callback.chosen(c.getTimeInMillis());},c.get(Calendar.HOUR_OF_DAY),c.get(Calendar.MINUTE),android.text.format.DateFormat.is24HourFormat(a)).show();
        },c.get(Calendar.YEAR),c.get(Calendar.MONTH),c.get(Calendar.DAY_OF_MONTH)).show();
    }
    static void error(Activity a,Exception e) {new AlertDialog.Builder(a).setTitle("Couldn't save").setMessage("Please try again. If you were editing, your input is still here.").setPositiveButton("OK",null).show();}
    static void reminder(Activity a,Store s,long id,Runnable changed) {
        new AlertDialog.Builder(a).setTitle("How should this alert you?").setItems(new String[]{"Notification reminder","Ringing alarm"},(d,w)->{if(w==0)notificationReminder(a,s,id,changed);else alarm(a,s,id,changed);}).show();
    }
    static void requestNotifications(Activity a){
        boolean asked=a.getSharedPreferences("permissions",0).getBoolean("notifications_asked",false);
        if(Build.VERSION.SDK_INT>=33&&a.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED&&(!asked||a.shouldShowRequestPermissionRationale(android.Manifest.permission.POST_NOTIFICATIONS))){
            a.getSharedPreferences("permissions",0).edit().putBoolean("notifications_asked",true).apply();a.requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},44);
        }else a.startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,a.getPackageName()));
    }
    static void alarm(Activity a,Store s,long id,Runnable changed){
        JSONObject e=s.get(id);
        if(!Alarms.notificationsAllowed(a)){
            new AlertDialog.Builder(a).setTitle("Enable alarm notifications").setMessage("Your entry is saved. Notifications provide visible Dismiss and Snooze controls. Enable them, then choose your alarm time.").setNegativeButton("Later",null).setPositiveButton("Enable",(d,w)->requestNotifications(a)).show();return;
        }
        if(!Alarms.exactAllowed(a)){
            new AlertDialog.Builder(a).setTitle("Allow alarms & reminders").setMessage("Android requires this permission to schedule a ringing alarm at your chosen time. Enable it for RPM, then return and choose your alarm time.").setNegativeButton("Later",null).setPositiveButton("Open settings",(d,w)->a.startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,android.net.Uri.parse("package:"+a.getPackageName())))).show();return;
        }
        long initial=e.isNull("planned")?System.currentTimeMillis()+3600000:e.optLong("planned");
        time(a,Math.max(initial,System.currentTimeMillis()+60000),at->{
            if(at<=System.currentTimeMillis()){Toast.makeText(a,"Choose a future time",Toast.LENGTH_LONG).show();return;}
            String screen=Alarms.fullScreenAllowed(a)?"":"\nFull-screen alerts are disabled. You can enable them in alarm settings; a notification still provides controls.";
            new AlertDialog.Builder(a).setTitle("Ringing alarm").setMessage(e.optString("title")+"\n"+Ui.date(at)+"\n\nRings using your phone's alarm volume, even offline. Snooze is 10 minutes. Stops after 10 minutes if unanswered."+screen)
                .setNegativeButton("Cancel",null).setPositiveButton("Set alarm",(d,w)->{
                    try{ContentValues v=new ContentValues();v.put("alarm",at);v.put("alarm_status","scheduled");s.update(id,v,"User confirmed ringing alarm at "+Ui.date(at));Alarms.schedule(a,id,at);changed.run();Toast.makeText(a,"Ringing alarm set",Toast.LENGTH_LONG).show();}
                    catch(Exception ex){Alarms.cancel(a,id);try{ContentValues v=new ContentValues();v.put("alarm_status","failed");s.update(id,v,"Alarm scheduling failed");changed.run();}catch(Exception ignored){}error(a,ex);}
                }).show();
        });
    }
    static void notificationReminder(Activity a,Store s,long id,Runnable changed) {
        JSONObject e=s.get(id);
        long initial=e.isNull("planned")?System.currentTimeMillis()+3600000:e.optLong("planned");
        time(a,Math.max(initial,System.currentTimeMillis()+60000),at->{
            if(at<=System.currentTimeMillis()){Toast.makeText(a,"Choose a future time",Toast.LENGTH_LONG).show();return;}
            new AlertDialog.Builder(a).setTitle("Notification reminder")
            .setMessage(e.optString("title")+"\n"+Ui.date(at)+"\n\nThis is a notification, not a ringing alarm. Android and battery settings can delay it.")
            .setNegativeButton("Cancel",null).setPositiveButton("Set reminder",(d,w)->{
                if(!Reminders.permitted(a)) {
                    new AlertDialog.Builder(a).setTitle("Allow notifications first").setMessage("The entry is saved. Enable RPM notifications, then tap Remind again to choose and confirm a time.")
                    .setNegativeButton("Later",null).setPositiveButton("Enable",(x,y)->{
                        requestNotifications(a);
                    }).show();return;
                }
                try {
                    ContentValues v=new ContentValues();v.put("reminder",at);v.put("reminder_status","scheduled");
                    s.update(id,v,"User confirmed notification reminder at "+Ui.date(at));
                    Reminders.schedule(a,id,at);changed.run();
                    Toast.makeText(a,"Reminder scheduled · delivery time may vary",Toast.LENGTH_LONG).show();
                } catch(Exception ex) {
                    Reminders.cancel(a,id);
                    try {ContentValues failed=new ContentValues();failed.put("reminder_status","failed");s.update(id,failed,"Reminder could not be scheduled");changed.run();}catch(Exception ignored){}
                    error(a,ex);
                }
            }).show();
        });
    }
    static void edit(Activity a,Store s,long id,Runnable changed) {
        JSONObject e=s.get(id);LinearLayout form=Ui.column(a);Ui.pad(form,20);
        EditText title=Ui.input(a,"Title");title.setText(e.optString("title"));Ui.field(form,"Title",title);
        form.addView(Ui.text(a,e.optString("kind").equals("plan")?"Estimated minutes (not measured)":"Reported actual minutes (optional)",14,Ui.MUTED));
        EditText duration=Ui.input(a,"Minutes");duration.setInputType(2);duration.setText(e.isNull("minutes")?"":e.optString("minutes"));form.addView(duration);
        EditText notes=Ui.input(a,"Notes (optional)");notes.setText(e.optString("notes"));Ui.field(form,"Notes · optional",notes);
        ScrollView scroll=new ScrollView(a);scroll.addView(form);
        AlertDialog dialog=new AlertDialog.Builder(a).setTitle("Edit entry").setView(scroll).setNegativeButton("Cancel",null).setPositiveButton("Save",null).create();
        dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{
            if(title.getText().toString().trim().isEmpty()){title.setError("Add a title");return;}
            String minutes=duration.getText().toString().trim();int n=0;
            try {if(!minutes.isEmpty()){n=Integer.parseInt(minutes);if(n<1||n>1440)throw new NumberFormatException();}}
            catch(NumberFormatException ex){duration.setError("Use 1–1440 minutes");return;}
            if(e.optString("kind").equals("plan")&&minutes.isEmpty()){duration.setError("Keep an estimate (default 30)");return;}
            ContentValues values=new ContentValues();values.put("title",title.getText().toString().trim());values.put("notes",notes.getText().toString());
            if(minutes.isEmpty())values.putNull("minutes");else values.put("minutes",n);
            values.put("duration_source",e.optString("kind").equals("plan")?"chosen_estimate":minutes.isEmpty()?"not_reported":"reported_actual");
            try{s.update(id,values,"User edited title, duration or notes; raw input retained");changed.run();dialog.dismiss();}catch(Exception ex){error(a,ex);}
        }));dialog.show();
    }
    static void purpose(Activity a,Store s,String current,java.util.function.Consumer<String> selected) {
        ArrayList<String> options=new ArrayList<>();options.add("Write a purpose…");options.add("No purpose");
        for(JSONObject row:s.query("SELECT DISTINCT purpose FROM entries WHERE purpose<>'' UNION SELECT purpose FROM projects WHERE purpose<>''",null))options.add(row.optString("purpose"));
        new AlertDialog.Builder(a).setTitle("Purpose · optional").setItems(options.toArray(new String[0]),(d,w)->{
            if(w==1){selected.accept("");return;}if(w>1){selected.accept(options.get(w));return;}
            EditText input=Ui.input(a,"Why does this matter to you?");input.setText(current);
            new AlertDialog.Builder(a).setTitle("Reusable purpose").setView(input).setNegativeButton("Cancel",null).setPositiveButton("Use purpose",(x,y)->selected.accept(input.getText().toString().trim())).show();
        }).show();
    }
}
