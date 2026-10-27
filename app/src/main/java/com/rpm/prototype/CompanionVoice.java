package com.rpm.prototype;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.speech.RecognizerIntent;
import android.webkit.PermissionRequest;
import java.util.ArrayList;
import org.json.JSONException;
import org.json.JSONObject;

/** Capture's voice on the phone: system dictation, the page's mic grant and the Gemini Live token. */
final class CompanionVoice {
    interface Reply{void send(String id,Object value,String error);}
    static final int DICTATE=302;
    private final Activity activity;private final Reply reply;
    private String dictation;private PermissionRequest pendingMic;
    CompanionVoice(Activity activity,Reply reply){this.activity=activity;this.reply=reply;}

    /** The old path: Android's speech dialog, used when no Gemini key is connected. Runs on the UI thread. */
    void dictate(String id){
        if(dictation!=null){reply.send(id,null,"Voice input is already open.");return;}
        dictation=id;
        try{activity.startActivityForResult(new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM).putExtra(RecognizerIntent.EXTRA_PROMPT,"Capture your thought"),DICTATE);}
        catch(ActivityNotFoundException error){dictation=null;reply.send(id,null,"Voice input is unavailable on this device. You can use keyboard dictation.");}
    }
    boolean dictated(int request,int result,Intent intent){
        if(request!=DICTATE||dictation==null)return false;
        String id=dictation;dictation=null;
        try{ArrayList<String> words=intent==null?null:intent.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);reply.send(id,new JSONObject().put("text",result==Activity.RESULT_OK&&words!=null&&!words.isEmpty()?words.get(0):""),null);}
        catch(JSONException error){reply.send(id,null,"Voice input could not be read.");}
        return true;
    }

    /** voiceToken, micAccess and micSettings bridge actions; runs on a work thread. */
    JSONObject invoke(String action,JSONObject p)throws Exception{
        switch(action){
            case "voiceToken":return VoiceToken.mint(()->GeminiKey.get(activity),p.opt("setup"),VoiceToken.ENDPOINT,System.currentTimeMillis());
            case "micAccess":boolean granted=micGranted();
                return new JSONObject().put("granted",granted).put("canAsk",granted||!activity.getSharedPreferences(MicGrant.PREFS,0).getBoolean(MicGrant.ASKED,false)||activity.shouldShowRequestPermissionRationale(Manifest.permission.RECORD_AUDIO));
            case "micSettings":activity.runOnUiThread(()->activity.startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.fromParts("package",activity.getPackageName(),null))));return new JSONObject();
            default:throw new IllegalArgumentException("Unsupported phone action.");
        }
    }

    /** Grants the page the mic only for Capture's own origin and only after Android grants RECORD_AUDIO; anything else is denied. */
    void micRequest(PermissionRequest request){activity.runOnUiThread(()->{
        if(!MicGrant.allowed(String.valueOf(request.getOrigin()),request.getResources())){request.deny();return;}
        if(micGranted()){request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});return;}
        if(pendingMic!=null)pendingMic.deny();
        pendingMic=request;activity.getSharedPreferences(MicGrant.PREFS,0).edit().putBoolean(MicGrant.ASKED,true).apply();
        activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},MicGrant.REQUEST);
    });}
    /** True while Android shows the mic prompt; that prompt pauses the activity but must not stop the ramble. */
    boolean asking(){return pendingMic!=null;}
    void micCanceled(PermissionRequest request){if(pendingMic==request)pendingMic=null;}
    boolean permissionResult(int request,int[] results){
        if(request!=MicGrant.REQUEST)return false;
        PermissionRequest mic=pendingMic;pendingMic=null;
        if(mic!=null){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)mic.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else mic.deny();}
        return true;
    }
    private boolean micGranted(){return activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED;}
}
