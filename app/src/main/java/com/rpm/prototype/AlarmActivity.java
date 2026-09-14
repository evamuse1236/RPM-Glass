package com.rpm.prototype;
import android.app.*;
import android.content.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.util.List;

public final class AlarmActivity extends Activity {
    @Override public void onCreate(Bundle b){super.onCreate(b);if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true);}else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED|WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);render();}
    @Override protected void onResume(){super.onResume();render();}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);render();}
    private void render(){
        Ui.theme(this);LinearLayout root=Ui.column(this);root.setBackgroundColor(Ui.PALE);ScrollView scroll=new ScrollView(this);root.addView(scroll);LinearLayout body=Ui.column(this);Ui.pad(body,28);scroll.addView(body);
        body.addView(Ui.text(this,"Ringing alarm",16,Ui.ON_CONTAINER));Ui.gap(body,24);body.addView(Ui.heading(this,Ui.time(System.currentTimeMillis()),48));Ui.gap(body,24);
        try(Store s=new Store(this)){
            List<JSONObject> alarms=s.query("SELECT * FROM entries WHERE alarm_status='ringing' ORDER BY alarm",null);
            // The full-screen intent may arrive just before the service commits its state.
            if(alarms.isEmpty()&&AlarmService.running)new Handler(Looper.getMainLooper()).postDelayed(()->{if(!isFinishing())render();},400);
            for(JSONObject e:alarms){long id=e.optLong("_id");LinearLayout card=Ui.card(this);card.addView(Ui.heading(this,e.optString("title"),26));Ui.gap(card,16);card.addView(Ui.text(this,"Ringing alarm · "+Ui.date(e.optLong("alarm")),15,Ui.MUTED));Ui.gap(card,24);card.addView(Ui.button(this,"Dismiss",true,()->act(id,"STOP")));card.addView(Ui.button(this,"Snooze 10 min",false,()->act(id,"SNOOZE")));body.addView(card);}
            if(alarms.isEmpty())body.addView(Ui.text(this,"No alarm is ringing right now.",18,Ui.NAVY));
        }
        body.addView(Ui.button(this,"Open RPM",false,()->{startActivity(new Intent(this,MainActivity.class));finish();}));setContentView(root);Ui.insets(this,root);
    }
    private void act(long id,String action){startService(new Intent(this,AlarmService.class).setAction(action).putExtra("id",id));new Handler(Looper.getMainLooper()).postDelayed(()->{if(!isFinishing())render();},250);}
}
