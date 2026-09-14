package com.rpm.prototype;
import android.app.*;
import android.os.Bundle;
import android.text.InputType;
import android.widget.*;

public final class CloudActivity extends Activity {
    private EditText url,code;
    private Button connect;
    private boolean pairingExpanded;
    private TextView syncStatus,pendingStatus,lastStatus;
    private final android.os.Handler refreshHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable refreshStatus=new Runnable(){public void run(){updateStatus();refreshHandler.postDelayed(this,2000);}};
    @Override protected void onResume(){super.onResume();refreshHandler.post(refreshStatus);}
    @Override protected void onPause(){refreshHandler.removeCallbacks(refreshStatus);super.onPause();}
    private void updateStatus(){
        if(syncStatus==null)return;
        try(Store store=new Store(this)){
            int count=store.pendingCount();boolean paired=SyncManager.configured(this);
            String status=SyncManager.prefs(this).getString("status","Waiting to sync");
            if(count>0&&status.equals("Up to date"))status="Waiting to upload";
            syncStatus.setText(paired?status:"Pair this phone with your own Convex project.");
            pendingStatus.setText(count+" saved changes waiting to upload");
            long last=SyncManager.prefs(this).getLong("last_success",0);
            lastStatus.setText(last>0?"Last successful sync: "+Ui.date(last):"No successful sync yet");
        }
    }
    @Override public void onCreate(Bundle state){super.onCreate(state);render();}
    private void render(){
        Ui.theme(this);LinearLayout root=Ui.column(this);root.setBackgroundColor(Ui.PAPER);root.addView(Ui.toolbar(this,"Cloud sync",this::finish));ScrollView scroll=new ScrollView(this);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));LinearLayout body=Ui.column(this);Ui.padding(body,20,16,20,24);scroll.addView(body);
        
        body.addView(Ui.text(this,"Save instantly on your phone. Convex receives saved entries, check-ins, edits and results when a connection is available.",16,Ui.MUTED));
        boolean paired=SyncManager.configured(this);
        try(Store store=new Store(this)){
            LinearLayout status=Ui.card(this);status.addView(Ui.heading(this,paired?"Convex sync":"Connect once",20));
            syncStatus=Ui.text(this,"",15,Ui.NAVY);status.addView(syncStatus);Ui.gap(status,12);
            pendingStatus=Ui.text(this,"",14,Ui.MUTED);status.addView(pendingStatus);Ui.gap(status,8);
            lastStatus=Ui.text(this,"",13,Ui.MUTED);status.addView(lastStatus);
            updateStatus();
            if(paired)status.addView(Ui.text(this,SyncManager.prefs(this).getString("url",""),13,Ui.MUTED));body.addView(status);
        }
        if(paired){
            body.addView(Ui.button(this,"Sync now",true,()->{Toast.makeText(this,"Syncing…",Toast.LENGTH_SHORT).show();SyncManager.now(this,()->{if(!isFinishing())render();});}));
            body.addView(Ui.button(this,"Disconnect this phone",false,()->new AlertDialog.Builder(this).setTitle("Disconnect Convex?").setMessage("Local entries and cloud records remain. New changes will wait on this phone until you pair again.").setNegativeButton("Keep connected",null).setPositiveButton("Disconnect",(d,w)->{SyncManager.disconnect(this);render();}).show()));
        }
        if(paired)body.addView(Ui.textButton(this,pairingExpanded?"Hide pairing details":"Pair again…",()->{pairingExpanded=!pairingExpanded;render();}));
        if(!paired||pairingExpanded){
        Ui.gap(body,24);body.addView(Ui.heading(this,paired?"Pair again if needed":"One-time pairing",19));
        url=Ui.input(this,"https://your-deployment.convex.site");url.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_URI);url.setText(SyncManager.prefs(this).getString("url",getString(R.string.convex_default_url)));Ui.field(body,"Deployment address",url);
        code=Ui.input(this,"Pairing code");code.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);Ui.field(body,"One-time pairing code",code);
        body.addView(Ui.text(this,"Use the short-lived code generated during Convex setup. Your deployment admin key is never needed on the phone.",14,Ui.MUTED));
        connect=Ui.button(this,"Connect & sync",true,()->{
            String address=url.getText().toString().trim(),secret=code.getText().toString().trim();
            try{SyncManager.validateUrl(address);}catch(Exception ex){url.setError(ex.getMessage());return;}
            if(!secret.matches("[a-f0-9]{32}")){code.setError("Enter the 32-character pairing code");return;}
            connect.setEnabled(false);connect.setText("Connecting…");
            SyncManager.EXECUTOR.execute(()->{
                try{SyncManager.pair(getApplicationContext(),address,secret);SyncManager.sync(getApplicationContext());runOnUiThread(()->{if(!isFinishing())render();});}
                catch(Exception ex){runOnUiThread(()->{if(isFinishing())return;connect.setEnabled(true);connect.setText("Connect & sync");new AlertDialog.Builder(this).setTitle("Couldn't connect").setMessage("Check your connection, deployment URL and pairing code. A code expires after 30 minutes and works once. All entries remain saved on the phone.").setPositiveButton("OK",null).show();});}
            });
        });body.addView(connect);
        }
        Ui.gap(body,24);
        body.addView(Ui.text(this,"Sync runs after saves and periodically when Android allows background work. This version uploads data; it does not restore or apply cloud edits to this phone.",13,Ui.MUTED));
        setContentView(root);Ui.insets(this,root);
    }
}
