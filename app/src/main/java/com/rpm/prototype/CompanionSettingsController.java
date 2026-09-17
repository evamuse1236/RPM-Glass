package com.rpm.prototype;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.widget.EditText;
import android.widget.Toast;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/**
 * Owns Android-only settings flows for any trusted companion host.
 * The WebView receives safe status labels only; keys and selected file contents
 * stay inside native dialogs, pickers, Keystore, and private storage.
 */
final class CompanionSettingsController {
    static final int IMPORT_CONTEXT=71,EXPORT_CONTEXT=72,PICK_TONE=73,PICK_AUDIO=74,NOTIFICATIONS=32;
    private static final Set<String> ACTIONS=Set.of(
        "set_transparency","set_widget_text_scale","choose_alarm","preview_alarm","stop_preview","reminder_sound",
        "show_butterfly","hide_butterfly","overlay_permission","notifications","exact_alarms",
        "full_screen_alarms","check_alerts","connect_key","remove_key","import_context",
        "export_context","restore_backup","earlier_screens"
    );
    private final Activity activity;
    private final Runnable changed;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final Handler ui=new Handler(Looper.getMainLooper());
    private volatile boolean destroyed=false,working=false,previewing=false;
    private MediaPlayer preview;
    private final Runnable stopPreviewLater=()->{stopPreview();notifyChanged();};

    CompanionSettingsController(Activity activity,Runnable changed){this.activity=activity;this.changed=changed;}

    JSONObject read()throws JSONException{
        return CompanionControls.read(activity).put("previewing",previewing).put("working",working);
    }

    JSONObject apply(JSONObject payload)throws Exception{
        return perform(validate(payload),payload);
    }

    static String validate(JSONObject payload){
        String action=payload.optString("action","");
        if(!ACTIONS.contains(action))throw new IllegalArgumentException("Unsupported settings action.");
        Set<String> allowed=action.startsWith("set_")?Set.of("action","value"):Set.of("action");
        for(Iterator<String> keys=payload.keys();keys.hasNext();)if(!allowed.contains(keys.next()))throw new IllegalArgumentException("Unsupported settings value.");
        return action;
    }

    private JSONObject perform(String action,JSONObject payload)throws Exception{
        String message;
        switch(action){
            case "set_transparency":
                message=CompanionControls.apply(activity,new JSONObject().put("action","transparency").put("value",payload.opt("value"))).getString("message");
                notifyChanged();break;
            case "set_widget_text_scale":
                message=CompanionControls.apply(activity,new JSONObject().put("action","widget_text_scale").put("value",payload.opt("value"))).getString("message");
                notifyChanged();break;
            case "choose_alarm":runUi(this::chooseAlarm);message="Choose an alarm sound on your phone.";break;
            case "preview_alarm":runUi(this::togglePreview);message=previewing?"Playing the alarm sound for 5 seconds.":"Alarm preview stopped.";break;
            case "stop_preview":runUi(()->{stopPreview();notifyChanged();});message="Alarm preview stopped.";break;
            case "reminder_sound":runUi(()->launch(AlertSounds.reminderSettings(activity,CompanionAlerts.REMINDERS)));message="Opening Android reminder sound settings.";break;
            case "show_butterfly":message=CompanionControls.apply(activity,new JSONObject().put("action","show_butterfly")).getString("message");ui.postDelayed(this::notifyChanged,300);break;
            case "hide_butterfly":message=CompanionControls.apply(activity,new JSONObject().put("action","hide_butterfly")).getString("message");notifyChanged();break;
            case "overlay_permission":runUi(()->launch(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+activity.getPackageName()))));message="Opening Android floating-window permission.";break;
            case "notifications":runUi(this::openNotifications);message="Opening Android notification controls.";break;
            case "exact_alarms":runUi(()->{if(Build.VERSION.SDK_INT>=31)launch(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+activity.getPackageName())));});message=Build.VERSION.SDK_INT>=31?"Opening Android exact alarm permission.":"Exact alarms are already available on this Android version.";break;
            case "full_screen_alarms":runUi(()->{if(Build.VERSION.SDK_INT>=34)launch(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,Uri.parse("package:"+activity.getPackageName())));});message=Build.VERSION.SDK_INT>=34?"Opening Android lock-screen alarm controls.":"Lock-screen alarm permission is managed automatically on this Android version.";break;
            case "check_alerts":JSONObject data=CompanionStore.read(activity);if(data!=null)CompanionAlerts.reconcile(activity,data,true);message="Saved alert schedules checked.";notifyChanged();break;
            case "connect_key":runUi(this::keyDialog);message="Enter the key in the secure Android dialog.";break;
            case "remove_key":runUi(this::removeKeyDialog);message="Review the secure removal confirmation.";break;
            case "import_context":runUi(this::importDialog);message="Review the backup notice, then choose a context file.";break;
            case "export_context":runUi(()->activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"rpm-companion-context.json"),EXPORT_CONTEXT));message="Choose where to save the context copy.";break;
            case "restore_backup":runUi(this::backups);message="Choose a private pre-import backup.";break;
            case "earlier_screens":runUi(()->activity.startActivity(new Intent(activity,MainActivity.class)));message="Opening the earlier RPM screens.";break;
            default:throw new IllegalArgumentException("Unsupported settings action.");
        }
        return read().put("message",message);
    }

    void onResume(){notifyChanged();}
    void onPause(){if(previewing)stopPreview();}
    void onRequestPermissionsResult(int request){if(request==NOTIFICATIONS)notifyChanged();}
    void onActivityResult(int request,int result,Intent intent){
        if(result!=Activity.RESULT_OK||intent==null){notifyChanged();return;}
        if(request==PICK_TONE){
            Uri selected=Build.VERSION.SDK_INT>=33?intent.getParcelableExtra(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI,Uri.class):intent.getParcelableExtra(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if(selected!=null)background(()->AlertSounds.importAlarm(activity,selected,true),"Alarm sound saved.",false);
            return;
        }
        Uri uri=intent.getData();if(uri==null){notifyChanged();return;}
        if(request==PICK_AUDIO){background(()->AlertSounds.importAlarm(activity,uri,false),"Alarm sound saved.",false);return;}
        if(request==IMPORT_CONTEXT){background(()->{try(InputStream in=activity.getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("Could not open that context file.");CompanionStore.importCopy(activity,new JSONObject(CompanionStore.readText(in)));}},"Context imported. Saved alerts from the copy remain off.",true);return;}
        if(request==EXPORT_CONTEXT)background(()->{JSONObject data=CompanionStore.read(activity);if(data==null)throw new IOException("No saved context to export.");try(OutputStream out=activity.getContentResolver().openOutputStream(uri)){if(out==null)throw new IOException("Could not open that file.");out.write(data.toString(2).getBytes(StandardCharsets.UTF_8));}},"Context exported. Keep this personal file private.",false);
    }

    void destroy(){destroyed=true;ui.removeCallbacks(stopPreviewLater);stopPreview();io.shutdown();}

    private void chooseAlarm(){
        stopPreview();
        new AlertDialog.Builder(activity).setTitle("Alarm sound").setItems(new String[]{"Choose phone tone","Choose audio file","Use phone default"},(dialog,which)->{
            if(which==0)try{activity.startActivityForResult(AlertSounds.alarmPicker(activity),PICK_TONE);}catch(ActivityNotFoundException e){error("Your phone has no tone picker. Choose an audio file instead.");}
            else if(which==1)activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("audio/*").addCategory(Intent.CATEGORY_OPENABLE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),PICK_AUDIO);
            else background(()->AlertSounds.useDefault(activity),"Using the phone default alarm sound.",false);
        }).setNegativeButton("Cancel",null).show();
    }

    private void togglePreview(){
        if(previewing){stopPreview();notifyChanged();return;}
        previewing=true;
        preview=AlertSounds.playAlarm(activity,new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),()->ui.post(()->{stopPreview();notifyChanged();error("Sound could not play. Choose another alarm sound.");}));
        notifyChanged();ui.postDelayed(stopPreviewLater,5000);
    }
    private void stopPreview(){ui.removeCallbacks(stopPreviewLater);if(preview!=null){preview.release();preview=null;}previewing=false;}

    private void openNotifications(){
        if(Build.VERSION.SDK_INT>=33&&activity.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)activity.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATIONS);
        else launch(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,activity.getPackageName()));
    }

    private void keyDialog(){
        EditText key=new EditText(activity);key.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);key.setSingleLine(true);key.setHint("OpenRouter API key");key.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO);key.setPadding(30,20,30,20);
        activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Connect OpenRouter").setMessage("Used only for RPM chat. Saved encrypted on this phone; never bundled in the APK.").setView(key).setNegativeButton("Cancel",null).setPositiveButton("Save key",null).create();
        dialog.setOnShowListener(d->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{try{CompanionKey.set(activity,key.getText().toString());key.setText("");dialog.dismiss();notifyChanged();toast("AI key connected.");}catch(Exception e){key.setError("Paste a valid key, then try again.");}}));
        dialog.setOnDismissListener(d->{key.setText("");activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);notifyChanged();});dialog.show();dialog.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }

    private void removeKeyDialog(){new AlertDialog.Builder(activity).setTitle("Remove AI key?").setMessage("Your plans and conversations stay on this phone.").setNegativeButton("Keep",null).setPositiveButton("Remove",(d,w)->background(()->CompanionKey.set(activity,null),"AI key removed.",false)).show();}
    private void importDialog(){new AlertDialog.Builder(activity).setTitle("Replace this companion's context?").setMessage("Your current copy will be backed up privately first. Imported alerts stay off until you enable them in Current plans.").setNegativeButton("Cancel",null).setPositiveButton("Choose file",(d,w)->activity.startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE),IMPORT_CONTEXT)).show();}

    private void backups(){
        File[] files=activity.getFilesDir().listFiles((dir,name)->name.startsWith("companion-before-import-")&&name.endsWith(".json"));
        if(files==null||files.length==0){error("No pre-import backups yet.");return;}
        Arrays.sort(files,Comparator.comparing(File::getName).reversed());String[] names=Arrays.stream(files).map(File::getName).toArray(String[]::new);
        new AlertDialog.Builder(activity).setTitle("Restore a backup (alerts disarmed)").setItems(names,(d,w)->background(()->{try(InputStream in=new FileInputStream(files[w])){CompanionStore.importCopy(activity,new JSONObject(CompanionStore.readText(in)));}},"Backup restored. Its saved alerts remain off.",true)).setNegativeButton("Cancel",null).show();
    }

    private interface Work {void run()throws Exception;}
    private void background(Work task,String success,boolean dataChanged){
        if(working)return;working=true;notifyChanged();io.execute(()->{String problem=null;try{task.run();}catch(Exception e){problem=e.getMessage()==null?"Could not finish. Please try again.":e.getMessage();}String failure=problem;working=false;ui.post(()->{if(destroyed)return;notifyChanged();if(failure!=null)error(failure);else{toast(success);if(dataChanged)notifyChanged();}});});
    }

    private void launch(Intent intent){try{activity.startActivity(intent);}catch(ActivityNotFoundException e){error("Your phone does not provide this settings screen. Open RPM in Android app settings.");}}
    private void error(String value){if(!destroyed)new AlertDialog.Builder(activity).setMessage(value).setPositiveButton("OK",null).show();}
    private void toast(String value){if(value!=null&&!value.isEmpty()&&!destroyed)Toast.makeText(activity,value,Toast.LENGTH_SHORT).show();}
    private void notifyChanged(){if(!destroyed)ui.post(changed);}
    private void runUi(Runnable action)throws Exception{
        if(Looper.myLooper()==Looper.getMainLooper()){action.run();return;}
        FutureTask<Void> task=new FutureTask<>(()->{action.run();return null;});ui.post(task);task.get(5,TimeUnit.SECONDS);
    }
}
