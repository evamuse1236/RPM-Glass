package com.rpm.prototype;

import android.app.*;
import android.widget.*;
import org.json.*;

final class WebLinkDialog {
    private static final java.util.concurrent.ExecutorService IO=java.util.concurrent.Executors.newFixedThreadPool(2);
    static void show(Activity activity){
        if(!SyncManager.configured(activity)){new AlertDialog.Builder(activity).setTitle("Connect Cloud first").setMessage("Pair this phone with Convex, then link a web browser here.").setPositiveButton("OK",null).show();return;}
        LinearLayout content=Ui.column(activity);Ui.padding(content,24,16,24,16);
        TextView notice=Ui.text(activity,"Getting a one-use code…",16,Ui.NAVY);content.addView(notice);
        ScrollView scroll=new ScrollView(activity);scroll.addView(content);
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Link a web browser").setView(scroll).setPositiveButton("Close",null).setNeutralButton("Refresh browsers",null).create();dialog.show();
        String generation=SyncManager.generation(activity);
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(view->sessions(activity,dialog,content,null));
        IO.execute(()->{
            try{
                JSONObject code=SyncManager.web(activity,"POST","/v1/web/link-code",new JSONObject());
                activity.runOnUiThread(()->{
                    if(activity.isFinishing()||!dialog.isShowing()||!SyncManager.configured(activity)||!generation.equals(SyncManager.generation(activity)))return;
                    content.removeAllViews();TextView value=Ui.heading(activity,code.optString("code"),24);value.setTextIsSelectable(true);content.addView(value);
                    content.addView(Ui.text(activity,"Enter this code in your web browser. It works once and expires at "+Ui.date(code.optLong("expiresAt"))+". Your AI key stays on this phone.",15,Ui.MUTED));
                    sessions(activity,dialog,content,null);
                });
            }catch(Exception failure){activity.runOnUiThread(()->{if(dialog.isShowing())notice.setText("Could not get a code. Check the Cloud connection and try again.");});}
        });
    }
    private static void sessions(Activity activity,AlertDialog dialog,LinearLayout content,String revoke){
        String generation=SyncManager.generation(activity);
        IO.execute(()->{
            try{
                if(revoke!=null)SyncManager.web(activity,"POST","/v1/web/revoke",new JSONObject().put("sessionId",revoke));
                JSONArray sessions=SyncManager.web(activity,"GET","/v1/web/sessions",null).getJSONArray("sessions");
                activity.runOnUiThread(()->{
                    if(activity.isFinishing()||!dialog.isShowing()||!SyncManager.configured(activity)||!generation.equals(SyncManager.generation(activity)))return;
                    android.view.View old=content.findViewWithTag("browsers");if(old!=null)content.removeView(old);
                    LinearLayout browsers=Ui.column(activity);browsers.setTag("browsers");content.addView(browsers);Ui.gap(browsers,16);browsers.addView(Ui.heading(activity,"Linked browsers",18));
                    if(sessions.length()==0)browsers.addView(Ui.text(activity,"No linked browsers yet.",14,Ui.MUTED));
                    for(int i=0;i<sessions.length();i++){
                        JSONObject session=sessions.optJSONObject(i);if(session==null)continue;
                        String label=session.optString("label","Web browser"),id=session.optString("id");boolean revoked=session.optBoolean("revoked");
                        browsers.addView(Ui.text(activity,label+" · "+(revoked?"Revoked":"Last seen "+Ui.date(session.optLong("lastSeenAt"))),14,Ui.MUTED));
                        if(!revoked)browsers.addView(Ui.textButton(activity,"Revoke "+label,()->sessions(activity,dialog,content,id)));
                    }
                });
            }catch(Exception failure){activity.runOnUiThread(()->{if(dialog.isShowing())Toast.makeText(activity,"Could not refresh browsers. Try again when connected.",Toast.LENGTH_SHORT).show();});}
        });
    }
}
