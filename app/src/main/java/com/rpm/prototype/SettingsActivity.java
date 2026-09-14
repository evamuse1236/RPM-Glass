package com.rpm.prototype;

import android.app.*;
import android.appwidget.AppWidgetManager;
import android.content.*;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.*;

public final class SettingsActivity extends Activity {
    @Override public void onCreate(Bundle state){super.onCreate(state);}
    @Override protected void onResume(){super.onResume();render();}
    private void render(){Ui.theme(this);LinearLayout root=Ui.column(this);root.setBackgroundColor(Ui.PAPER);root.addView(Ui.toolbar(this,"Settings",this::finish));ScrollView scroll=new ScrollView(this);scroll.setVerticalScrollBarEnabled(false);LinearLayout body=Ui.column(this);Ui.padding(body,20,8,20,24);scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        Ui.section(body,"Your data");body.addView(Ui.option(this,R.drawable.ic_cloud,"Cloud sync",SyncManager.configured(this)?"Connected to Convex":"Connect once to upload saved entries",()->startActivity(new Intent(this,CloudActivity.class))));Ui.divider(body);body.addView(Ui.option(this,R.drawable.ic_export,"Export data","Save entries and edit history as JSON",this::export));
        Ui.section(body,"On your phone");body.addView(Ui.option(this,R.drawable.ic_open,"Home-screen widget","Check in, capture, or set a reminder",this::widget));Ui.divider(body);body.addView(Ui.option(this,R.drawable.ic_remind,"Notifications",Alarms.notificationsAllowed(this)?"Allowed":"Not allowed",()->startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()))));Ui.divider(body);body.addView(Ui.option(this,R.drawable.ic_clock,"Alarms & reminders",Alarms.exactAllowed(this)?"Exact alarms allowed":"Permission needed for ringing alarms",()->{if(android.os.Build.VERSION.SDK_INT>=31)startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,android.net.Uri.parse("package:"+getPackageName())));}));
        if(android.os.Build.VERSION.SDK_INT>=34){Ui.divider(body);body.addView(Ui.option(this,R.drawable.ic_open,"Full-screen alarms",Alarms.fullScreenAllowed(this)?"Allowed":"Use notification controls",()->startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,android.net.Uri.parse("package:"+getPackageName())))));}
        Ui.divider(body);body.addView(Ui.option(this,R.drawable.ic_clock,"Alarm sound",AlertSounds.alarmName(this),()->startActivity(new Intent(this,CompanionSettingsActivity.class))));
        Reminders.channel(this);Ui.divider(body);body.addView(Ui.option(this,R.drawable.ic_notification,"Reminder sound",AlertSounds.reminderName(this,Reminders.CHANNEL),()->startActivity(AlertSounds.reminderSettings(this,Reminders.CHANNEL))));
        Ui.gap(body,12);body.addView(Ui.text(this,"Alarms use your phone's alarm volume. Force-stop and power settings can affect delivery.",12,Ui.MUTED));
        Ui.section(body,"About RPM");body.addView(Ui.option(this,R.drawable.ic_info,"How your data works","Saved on your phone first",()->new AlertDialog.Builder(this).setTitle("Your data stays yours").setMessage("Entries save on this phone, even offline. If you connect Convex, saved entries and edits upload automatically. Unfinished drafts stay on your phone.\n\nCloud sync does not restore a new phone yet. Export before uninstalling or clearing app data.\n\nUse your keyboard's dictation if available. RPM does not record audio or send entries to an AI service.").setPositiveButton("Close",null).show()));Ui.gap(body,24);body.addView(Ui.text(this,"RPM · 0.4\nA place for your next step.",12,Ui.MUTED));setContentView(root);Ui.insets(this,root);
    }
    private void widget(){AppWidgetManager m=getSystemService(AppWidgetManager.class);if(m.isRequestPinAppWidgetSupported())m.requestPinAppWidget(new ComponentName(this,RpmWidget.class),null,null);else new AlertDialog.Builder(this).setTitle("Add the RPM widget").setMessage("Long-press your home screen, choose Widgets, then RPM.").setPositiveButton("Close",null).show();}
    private void export(){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"rpm-backup-"+java.time.LocalDate.now()+".json");startActivityForResult(i,52);}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==52&&result==RESULT_OK&&data!=null){try(Store store=new Store(this);java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out==null)throw new java.io.IOException("No output");out.write(store.exportJson().getBytes(java.nio.charset.StandardCharsets.UTF_8));Toast.makeText(this,"Export saved",Toast.LENGTH_SHORT).show();}catch(Exception ex){new AlertDialog.Builder(this).setTitle("Export didn't finish").setMessage("Your entries are still saved in RPM. Try exporting to another folder.").setPositiveButton("Close",null).show();}}}
}
