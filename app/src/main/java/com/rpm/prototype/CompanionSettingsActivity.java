package com.rpm.prototype;

import android.app.Activity;
import android.content.*;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.widget.*;

/** Legacy entrypoint retained for old intents; Settings now lives in PlannerActivity. */
public final class CompanionSettingsActivity extends Activity {
    static Intent plannerIntent(Context context,String section){try{return new Intent(context,PlannerActivity.class).putExtra("plannerTarget",new org.json.JSONObject().put("view",section==null||section.isBlank()?"settings":section).toString());}catch(org.json.JSONException ignored){return new Intent(context,PlannerActivity.class);}}
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        startActivity(plannerIntent(this,getIntent().getStringExtra("section")));
        finish();
    }

    // Shared alarm/launcher primitives retained for their existing native surfaces.
    static LinearLayout column(Context c){LinearLayout box=new LinearLayout(c);box.setOrientation(LinearLayout.VERTICAL);int p=(int)(20*c.getResources().getDisplayMetrics().density);box.setPadding(p,p,p,p);box.setBackgroundColor(0xff121821);return box;}
    static TextView text(Context c,String value,int size){TextView t=new TextView(c);t.setText(value);t.setTextSize(size);t.setTextColor(0xfff4f7fa);t.setPadding(0,12,0,20);return t;}
    static GradientDrawable pixelBackground(int fill){GradientDrawable d=new GradientDrawable();d.setColor(fill);d.setStroke(2,0xff536579);d.setCornerRadius(36);return d;}
    static Button button(Context c,String value){Button b=new Button(c);b.setText(value);b.setTextColor(0xfff4f7fa);b.setTextSize(15);b.setAllCaps(false);b.setMinHeight((int)(52*c.getResources().getDisplayMetrics().density));b.setBackground(pixelBackground(0xff1a2736));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,5,0,12);b.setLayoutParams(p);return b;}
}
