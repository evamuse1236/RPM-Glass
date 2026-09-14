package com.rpm.prototype;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.*;
import android.media.*;

public final class CompanionSettingsActivity extends Activity {
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private ScrollView scroll;private int scrollY;private boolean working;
    private MediaPlayer preview;private final Handler ui=new Handler(Looper.getMainLooper());
    private static final int PICK_TONE=73,PICK_AUDIO=74;
    static LinearLayout column(Context c){LinearLayout box=new LinearLayout(c);box.setOrientation(LinearLayout.VERTICAL);int p=(int)(20*c.getResources().getDisplayMetrics().density);box.setPadding(p,p,p,p);box.setBackgroundColor(0xff121821);return box;}
    static TextView text(Context c,String value,int size){TextView t=new TextView(c);t.setText(value);t.setTextSize(size);t.setTextColor(0xfff4f7fa);t.setPadding(0,12,0,20);return t;}
    static GradientDrawable pixelBackground(int fill){GradientDrawable d=new GradientDrawable();d.setColor(fill);d.setStroke(2,0xff536579);d.setCornerRadius(36);return d;}
    static Button button(Context c,String value){Button b=new Button(c);b.setText(value);b.setTextColor(0xfff4f7fa);b.setTextSize(15);b.setAllCaps(false);b.setMinHeight((int)(52*c.getResources().getDisplayMetrics().density));b.setBackground(pixelBackground(0xff1a2736));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,5,0,12);b.setLayoutParams(p);return b;}
    private void action(LinearLayout box,String label,Runnable run){Button b=button(this,label);b.setOnClickListener(v->run.run());box.addView(b);}
    @Override public void onCreate(Bundle saved){super.onCreate(saved);if(saved!=null)scrollY=saved.getInt("settings-scroll",0);}
    @Override protected void onSaveInstanceState(Bundle out){out.putInt("settings-scroll",scroll==null?scrollY:scroll.getScrollY());super.onSaveInstanceState(out);}
    @Override public void onResume(){super.onResume();render();String section=getIntent().getStringExtra("section");getIntent().removeExtra("section");if(section!=null)ui.post(()->openSection(section));}
    @Override public void onPause(){if(scroll!=null)scrollY=scroll.getScrollY();stopPreview();super.onPause();}
    @Override public void onDestroy(){stopPreview();io.shutdown();super.onDestroy();}
    private void render(){
        if(isFinishing()||isDestroyed())return;
        if(scroll!=null)scrollY=scroll.getScrollY();
        CompanionAlerts.channels(this);
        getWindow().setStatusBarColor(NightUi.BACKGROUND);getWindow().setNavigationBarColor(NightUi.BACKGROUND);getWindow().getDecorView().setSystemUiVisibility(0);
        LinearLayout root=NightUi.column(this);root.setBackgroundColor(NightUi.BACKGROUND);root.addView(NightUi.toolbar(this));
        LinearLayout box=NightUi.column(this);NightUi.pad(box,24,8);
        NightUi.section(box,"Sounds");
        NightUi.row(box,"Alarm sound",working?"Saving sound…":AlertSounds.alarmName(this),this::chooseAlarm);
        NightUi.row(box,preview==null?"Preview alarm sound":"Stop preview","Plays for 5 seconds at alarm volume",this::previewAlarm);
        NightUi.row(box,"Reminder sound",AlertSounds.reminderName(this,CompanionAlerts.REMINDERS),()->launch(AlertSounds.reminderSettings(this,CompanionAlerts.REMINDERS)));
        NightUi.note(box,"Alarms use alarm volume. Reminders use notification volume; choose their sound in Android.");
        NightUi.section(box,"Appearance");
        SharedPreferences appearance=getSharedPreferences("companion-appearance",0);int transparency=appearance.getInt("transparency",28);
        TextView label=NightUi.text(this,"Transparency · "+transparency+"%",15,NightUi.TEXT);box.addView(label);
        SeekBar slider=new SeekBar(this);slider.setMax(70);slider.setProgress(transparency);slider.setContentDescription("Widget transparency");slider.setLayoutParams(new LinearLayout.LayoutParams(-1,NightUi.dp(this,48)));slider.setProgressTintList(android.content.res.ColorStateList.valueOf(NightUi.ACCENT));slider.setThumbTintList(android.content.res.ColorStateList.valueOf(NightUi.ACCENT));box.addView(slider);
        NightUi.note(box,"Higher values show more of the app behind RPM. 0% is opaque.");
        slider.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar s,int value,boolean user){label.setText("Transparency · "+value+"%");if(user)appearance.edit().putInt("transparency",value).apply();}public void onStartTrackingTouch(SeekBar s){}public void onStopTrackingTouch(SeekBar s){}});
        NightUi.section(box,"Floating butterfly");
        NightUi.row(box,Settings.canDrawOverlays(this)?"Show butterfly":"Allow floating butterfly",Settings.canDrawOverlays(this)?"Tap to chat · drag to move":"Open RPM over your other apps",()->{if(!Settings.canDrawOverlays(this))launch(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));else{startForegroundService(new Intent(this,ButterflyService.class));Toast.makeText(this,"Butterfly ready. Leave RPM to see it.",Toast.LENGTH_SHORT).show();}});
        NightUi.row(box,"Hide butterfly","You can still open RPM from its app icon",()->{stopService(new Intent(this,ButterflyService.class));Toast.makeText(this,"Butterfly hidden",Toast.LENGTH_SHORT).show();});
        NightUi.section(box,"Phone alerts");
        NightUi.row(box,"Notifications",CompanionAlerts.notifications(this,CompanionAlerts.REMINDERS)?"Allowed":"Permission needed",()->{if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},32);else launch(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));});
        NightUi.row(box,"Exact alarms",CompanionAlerts.exact(this)?"Allowed":"Permission needed",()->{if(Build.VERSION.SDK_INT>=31)launch(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));});
        if(Build.VERSION.SDK_INT>=34)NightUi.row(box,"Lock-screen alarms",getSystemService(NotificationManager.class).canUseFullScreenIntent()?"Allowed":"Use notification controls",()->launch(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,Uri.parse("package:"+getPackageName()))));
        NightUi.row(box,"Check saved alerts","Retry scheduling after changing permissions",()->background(()->CompanionAlerts.restore(this),"Schedules checked. See Current plans for each result."));
        NightUi.note(box,"Android battery restrictions can delay reminders. Keep RPM installed for saved alarms to ring.");
        NightUi.section(box,"AI connection");
        boolean hasKey=CompanionKey.has(this);
        NightUi.row(box,hasKey?"Replace AI key":"Connect AI key",hasKey?"OpenRouter · key saved securely":"Connect OpenRouter to chat",this::keyDialog);
        if(hasKey)NightUi.row(box,"Remove AI key","Your plans and conversations stay on this phone",()->new AlertDialog.Builder(this).setTitle("Remove AI key?").setMessage("Your plans and conversations stay here.").setNegativeButton("Keep",null).setPositiveButton("Remove",(d,w)->background(()->CompanionKey.set(this,null),"AI key removed")).show());
        NightUi.section(box,"Context & history");
        NightUi.row(box,"Import context copy","Replace after a private backup; imported alerts stay off",()->new AlertDialog.Builder(this).setTitle("Replace this companion's context?").setMessage("Your current copy will be backed up privately first. Imported alerts stay off until you enable them in Current plans.").setNegativeButton("Cancel",null).setPositiveButton("Choose file",(d,w)->startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE),71)).show());
        NightUi.row(box,"Export context","Save your conversations and plans as a file",()->startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"rpm-companion-context.json"),72));
        NightUi.row(box,"Restore a backup","Choose a copy saved before an import",this::backups);
        NightUi.row(box,"Earlier RPM screens","Open the separate original planner",()->startActivity(new Intent(this,MainActivity.class)));
        NightUi.note(box,"Saved on this phone. Relevant context goes to OpenRouter when you chat.");
        for(int i=0;i<box.getChildCount();i++){View child=box.getChildAt(i);if(child.isClickable()||child instanceof SeekBar)child.setEnabled(!working);}
        scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(box);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});root.requestApplyInsets();
        scroll.post(()->{if(scroll!=null)scroll.scrollTo(0,scrollY);});
    }
    private void chooseAlarm(){
        if(working)return;
        stopPreview();
        new AlertDialog.Builder(this).setTitle("Alarm sound").setItems(new String[]{"Choose phone tone","Choose audio file","Use phone default"},(d,which)->{
            if(which==0){try{startActivityForResult(AlertSounds.alarmPicker(this),PICK_TONE);}catch(ActivityNotFoundException e){error("Your phone has no tone picker. Choose an audio file instead.");}}
            else if(which==1)startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),PICK_AUDIO);
            else background(()->AlertSounds.useDefault(this),"Using phone default alarm sound");
        }).setNegativeButton("Cancel",null).show();
    }
    private void openSection(String section){
        switch(section){
            case "alarm_sound":chooseAlarm();break;
            case "reminder_sound":launch(AlertSounds.reminderSettings(this,CompanionAlerts.REMINDERS));break;
            case "ai_connection":keyDialog();break;
            case "notifications":launch(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()));break;
            case "exact_alarms":if(Build.VERSION.SDK_INT>=31)launch(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));break;
            case "import_export":if(scroll!=null)scroll.fullScroll(View.FOCUS_DOWN);break;
            default:break;
        }
    }
    private interface Work {void run()throws Exception;}
    private void background(Work task,String success){if(working)return;working=true;render();
        io.execute(()->{String problem=null;try{task.run();}catch(Exception e){problem=e.getMessage()==null?"Could not finish. Please try again.":e.getMessage();}final String failure=problem;
            runOnUiThread(()->{working=false;if(isFinishing()||isDestroyed())return;render();if(failure!=null)error(failure);else if(success!=null)Toast.makeText(this,success,Toast.LENGTH_SHORT).show();});
        });
    }
    private void stopPreview(){ui.removeCallbacksAndMessages(null);if(preview!=null){preview.release();preview=null;}}
    private void previewAlarm(){if(preview!=null){stopPreview();render();return;}preview=AlertSounds.playAlarm(this,new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),()->ui.post(()->{stopPreview();render();error("Sound could not play. Choose another alarm sound.");}));render();ui.postDelayed(()->{stopPreview();render();},5000);}
    private void keyDialog(){EditText key=new EditText(this);key.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);key.setSingleLine(true);key.setHint("OpenRouter API key");key.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);key.setPadding(30,20,30,20);getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Connect OpenRouter").setMessage("Used only for RPM chat. Saved encrypted on this phone; never bundled in the APK.").setView(key).setNegativeButton("Cancel",null).setPositiveButton("Save key",null).create();dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{CompanionKey.set(this,key.getText().toString());key.setText("");dialog.dismiss();render();}catch(Exception e){key.setError("Paste a valid key, then try again.");}}));dialog.setOnDismissListener(d->{key.setText("");getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);});dialog.show();dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);}
    private void backups(){File[] files=getFilesDir().listFiles((dir,name)->name.startsWith("companion-before-import-")&&name.endsWith(".json"));if(files==null||files.length==0){error("No pre-import backups yet.");return;}java.util.Arrays.sort(files,java.util.Comparator.comparing(File::getName).reversed());String[] names=java.util.Arrays.stream(files).map(File::getName).toArray(String[]::new);new AlertDialog.Builder(this).setTitle("Restore a backup (alerts disarmed)").setItems(names,(d,w)->{try(InputStream in=new FileInputStream(files[w])){CompanionStore.importCopy(this,new JSONObject(CompanionStore.readText(in)));reopen();}catch(Exception e){error("Backup could not be restored. Current data preserved.");}}).setNegativeButton("Cancel",null).show();}
    private void launch(Intent intent){try{startActivity(intent);}catch(ActivityNotFoundException e){error("Your phone does not provide this settings screen. Open RPM in Android app settings.");}}
    private void error(String value){new AlertDialog.Builder(this).setMessage(value).setPositiveButton("OK",null).show();}
    private void reopen(){startActivity(new Intent(this,CompanionActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_NEW_TASK).putExtra("reload",true));finish();}
    @Override protected void onActivityResult(int request,int result,Intent intent){
        super.onActivityResult(request,result,intent);if(result!=RESULT_OK||intent==null)return;
        if(request==PICK_TONE){Uri selected=Build.VERSION.SDK_INT>=33?intent.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI,Uri.class):intent.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);if(selected!=null)background(()->AlertSounds.importAlarm(this,selected,true),"Alarm sound saved");return;}
        Uri uri=intent.getData();if(uri==null)return;
        if(request==PICK_AUDIO){background(()->AlertSounds.importAlarm(this,uri,false),"Alarm sound saved");return;}
        if(request==71)background(()->{try(InputStream in=getContentResolver().openInputStream(uri)){CompanionStore.importCopy(this,new JSONObject(CompanionStore.readText(in)));}runOnUiThread(this::reopen);},null);
        else if(request==72)background(()->{JSONObject d=CompanionStore.read(this);if(d==null)throw new IOException("No saved context to export.");try(OutputStream out=getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException("Could not open that file.");out.write(d.toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));}},"Context exported. Keep this personal file private.");
    }
}
