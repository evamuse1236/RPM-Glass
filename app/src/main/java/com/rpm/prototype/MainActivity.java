package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.util.*;

/** Three persistent destinations; capture actions are separate from navigation. */
public final class MainActivity extends Activity {
    private Store store;
    private LinearLayout content;
    private ScrollView scroll;
    private String tab="next",filter="all";
    private final HashMap<String,Integer> positions=new HashMap<>();
    @Override public void onCreate(Bundle state){super.onCreate(state);Ui.theme(this);store=new Store(this);if(state!=null){tab=state.getString("tab","next");filter=state.getString("filter","all");for(String name:new String[]{"next","all","projects"})positions.put(name,state.getInt("scroll_"+name));}Reminders.channel(this);SyncManager.request(this);}
    @Override protected void onResume(){super.onResume();Ui.theme(this);Reminders.restore(this);Alarms.restore(this,false);render();long id=getIntent().getLongExtra("entry",-1);if(id>0){getIntent().removeExtra("entry");open(id);}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);}
    private void render(){
        boolean compact=getResources().getConfiguration().screenHeightDp<500;
        LinearLayout root=Ui.column(this);root.setBackgroundColor(Ui.PAPER);
        LinearLayout bar=Ui.row(this);Ui.padding(bar,20,12,8,4);
        LinearLayout title=Ui.column(this);if(!compact){title.addView(Ui.text(this,new java.text.SimpleDateFormat("EEEE, d MMMM",Locale.getDefault()).format(new Date()),12,Ui.MUTED));Ui.gap(title,4);}title.addView(Ui.heading(this,tab.equals("next")?"Next":tab.equals("projects")?"Results":"History",28));Ui.weighted(bar,title);
        if(tab.equals("next"))bar.addView(Ui.iconButton(this,R.drawable.ic_remind,"Remind",()->capture("remind")));
        bar.addView(Ui.iconButton(this,R.drawable.ic_settings,"Settings",()->startActivity(new Intent(this,SettingsActivity.class))));root.addView(bar);
        scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setClipToPadding(false);scroll.setVerticalScrollBarEnabled(false);
        content=Ui.column(this);Ui.padding(content,20,16,20,16);scroll.addView(content);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        if(tab.equals("projects"))projects();else entries();
        LinearLayout actions=Ui.row(this);Ui.padding(actions,20,8,20,12);actions.setBackgroundColor(Ui.PAPER);
        Button checkin=Ui.button(this,"Check in",false,()->capture("checkin"));Ui.buttonIcon(checkin,R.drawable.ic_checkin,false);Ui.weighted(actions,checkin);Ui.hgap(actions,12);
        Button capture=Ui.button(this,"Capture",true,()->capture("capture"));Ui.buttonIcon(capture,R.drawable.ic_capture,true);Ui.weighted(actions,capture);root.addView(actions);
        Ui.divider(root);LinearLayout nav=Ui.row(this);nav.setBackgroundColor(Ui.SURFACE);Ui.padding(nav,12,4,12,4);
        for(Object[] item:new Object[][]{{"next","Next",R.drawable.ic_next},{"all","History",R.drawable.ic_history},{"projects","Results",R.drawable.ic_results}}){
            String key=(String)item[0],label=(String)item[1];boolean selected=tab.equals(key);LinearLayout target=compact?Ui.row(this):Ui.column(this);target.setGravity(Gravity.CENTER);Ui.padding(target,4,8,4,8);target.setMinimumHeight(Ui.dp(this,compact?48:64));target.setBackground(Ui.ripple(this,Ui.bg(android.graphics.Color.TRANSPARENT,16,this)));
            FrameLayout pill=new FrameLayout(this);pill.setBackground(Ui.bg(selected?Ui.PALE:android.graphics.Color.TRANSPARENT,16,this));ImageView icon=Ui.iconView(this,(int)item[2],selected?Ui.ON_CONTAINER:Ui.MUTED);pill.addView(icon,new FrameLayout.LayoutParams(Ui.dp(this,24),Ui.dp(this,24),Gravity.CENTER));target.addView(pill,new LinearLayout.LayoutParams(Ui.dp(this,56),Ui.dp(this,32)));if(compact)Ui.hgap(target,8);else Ui.gap(target,4);
            TextView text=Ui.text(this,label,12,selected?Ui.NAVY:Ui.MUTED);text.setGravity(Gravity.CENTER);if(selected)text.setTypeface(android.graphics.Typeface.create("sans-serif-medium",android.graphics.Typeface.NORMAL));target.addView(text);
            target.setFocusable(true);target.setSelected(selected);target.setContentDescription(label);if(android.os.Build.VERSION.SDK_INT>=30)target.setStateDescription(selected?"Selected":"Not selected");for(int i=0;i<target.getChildCount();i++)target.getChildAt(i).setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            target.setOnClickListener(v->{positions.put(tab,scroll.getScrollY());tab=key;render();});Ui.weighted(nav,target);
        }
        root.addView(nav);setContentView(root);Ui.insets(this,root);scroll.post(()->scroll.scrollTo(0,positions.getOrDefault(tab,0)));
    }
    private void capture(String mode){startActivity(new Intent(this,CaptureActivity.class).putExtra("mode",mode));}
    private void open(long id){startActivity(new Intent(this,EntryActivity.class).putExtra("entry",id));}
    private void entries(){
        boolean next=tab.equals("next");
        if(!next){LinearLayout filters=Ui.row(this);for(String[] f:new String[][]{{"all","All"},{"checkin","Check-ins"},{"plan","Plans"}}){if(filters.getChildCount()>0)Ui.hgap(filters,8);Ui.weighted(filters,Ui.chip(this,f[1],filter.equals(f[0]),()->{filter=f[0];positions.put(tab,0);render();}));}content.addView(filters);Ui.gap(content,16);}
        List<JSONObject> rows=store.entries(next?"next":filter.equals("checkin")?"checkin":"all");if(!next&&filter.equals("plan"))rows.removeIf(e->!e.optString("kind").equals("plan"));
        if(rows.isEmpty()){empty(next?R.drawable.ic_next:R.drawable.ic_history,next?"Room for your next thought":"Your story starts here",next?"Capture a next step, or check in with how things are going.":"Your saved plans and check-ins will appear here.");return;}
        String last="";LinearLayout group=null;
        for(JSONObject e:rows){String day=next?(e.isNull("planned")?"Whenever you're ready":Ui.day(e.optLong("planned"))):Ui.day(e.optLong("created"));
            if(!day.equals(last)){if(group!=null)Ui.gap(content,24);LinearLayout heading=Ui.row(this);Ui.weighted(heading,Ui.heading(this,day,14));content.addView(heading);Ui.gap(content,8);group=Ui.column(this);group.setBackground(Ui.bg(Ui.SURFACE,16,this));content.addView(group);last=day;}else Ui.divider(group);
            group.addView(entryRow(this,e,()->open(e.optLong("_id"))));
        }
    }
    static View entryRow(Activity a,JSONObject e,Runnable open){
        boolean plan=e.optString("kind").equals("plan"),done=e.optInt("done")==1;LinearLayout row=Ui.row(a);Ui.padding(row,16,16,12,16);row.setMinimumHeight(Ui.dp(a,80));row.setBackground(Ui.ripple(a,Ui.bg(Ui.SURFACE,16,a)));
        FrameLayout marker=new FrameLayout(a);marker.setBackground(Ui.bg(plan?Ui.PAPER:Ui.PALE,12,a));ImageView glyph=Ui.iconView(a,done?R.drawable.ic_check:plan?R.drawable.ic_next:R.drawable.ic_checkin,done?Ui.SUCCESS:Ui.ON_CONTAINER);marker.addView(glyph,new FrameLayout.LayoutParams(Ui.dp(a,20),Ui.dp(a,20),Gravity.CENTER));row.addView(marker,new LinearLayout.LayoutParams(Ui.dp(a,36),Ui.dp(a,36)));Ui.hgap(row,12);
        LinearLayout labels=Ui.column(a);TextView title=Ui.heading(a,e.optString("title"),16);title.setMaxLines(2);title.setEllipsize(android.text.TextUtils.TruncateAt.END);labels.addView(title);Ui.gap(labels,6);
        String meta=plan?(done?"Done":"Plan"):"Check-in";if(plan&&!e.isNull("planned"))meta+=" · "+Ui.time(e.optLong("planned"));else if(!plan)meta+=" · "+Ui.time(e.optLong("created"));
        if(!e.isNull("minutes"))meta+=" · "+e.optInt("minutes")+(plan?" min estimate":" min reported");labels.addView(Ui.text(a,meta,12,Ui.MUTED));
        if(!plan&&!e.isNull("mood")){Ui.gap(labels,4);labels.addView(Ui.text(a,e.optString("mood")+(e.isNull("energy")?"":" · "+e.optString("energy")+" energy"),12,Ui.MUTED));}
        String alert=e.optString("alarm_status").equals("scheduled")?"Alarm · "+Ui.day(e.optLong("alarm"))+" "+Ui.time(e.optLong("alarm")):e.optString("reminder_status").equals("scheduled")?"Reminder · "+Ui.day(e.optLong("reminder"))+" "+Ui.time(e.optLong("reminder")):"";
        if(!alert.isEmpty()){Ui.gap(labels,4);labels.addView(Ui.text(a,alert,12,Ui.ACCENT));}Ui.weighted(row,labels);Ui.hgap(row,8);row.addView(Ui.iconView(a,R.drawable.ic_chevron,Ui.MUTED));row.setFocusable(true);row.setContentDescription(e.optString("title")+", "+meta+(!plan&&!e.isNull("mood")?", "+e.optString("mood"):"")+(!plan&&!e.isNull("energy")?", "+e.optString("energy")+" energy":"")+(alert.isEmpty()?"":", "+alert));for(int i=0;i<row.getChildCount();i++)row.getChildAt(i).setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);row.setOnClickListener(v->open.run());return row;
    }
    private void empty(int symbol,String title,String message){Ui.gap(content,48);LinearLayout box=Ui.column(this);box.setGravity(Gravity.CENTER);Ui.pad(box,24);FrameLayout icon=new FrameLayout(this);icon.setBackground(Ui.bg(Ui.PALE,24,this));icon.addView(Ui.iconView(this,symbol,Ui.ON_CONTAINER),new FrameLayout.LayoutParams(Ui.dp(this,32),Ui.dp(this,32),Gravity.CENTER));box.addView(icon,new LinearLayout.LayoutParams(Ui.dp(this,64),Ui.dp(this,64)));Ui.gap(box,24);TextView h=Ui.heading(this,title,22);h.setGravity(Gravity.CENTER);box.addView(h);Ui.gap(box,12);TextView copy=Ui.text(this,message,16,Ui.MUTED);copy.setGravity(Gravity.CENTER);box.addView(copy);content.addView(box);}
    private void projects(){
        LinearLayout top=Ui.row(this);Ui.weighted(top,Ui.text(this,"A little direction, when it helps.",14,Ui.MUTED));Button add=Ui.textButton(this,"Add result",()->startActivity(new Intent(this,ResultActivity.class)));top.addView(add,new LinearLayout.LayoutParams(-2,-2));content.addView(top);Ui.gap(content,16);
        List<JSONObject> projects=store.projects();if(projects.isEmpty()){empty(R.drawable.ic_results,"What matters to you?","Give a result a purpose. Link actions whenever you're ready.");return;}
        for(JSONObject p:projects){LinearLayout card=Ui.card(this);card.setBackground(Ui.ripple(this,Ui.bg(Ui.SURFACE,16,this)));LinearLayout title=Ui.row(this);Ui.weighted(title,Ui.heading(this,p.optString("result"),22));title.addView(Ui.iconView(this,R.drawable.ic_chevron,Ui.MUTED));card.addView(title);if(!p.optString("purpose").isEmpty()){Ui.gap(card,12);card.addView(Ui.text(this,p.optString("purpose"),16,Ui.MUTED));}Ui.gap(card,16);
            List<JSONObject> actions=store.query("SELECT done FROM entries WHERE project=? AND kind='plan'",new String[]{p.optString("_id")});int done=0;for(JSONObject e:actions)done+=e.optInt("done");card.addView(Ui.text(this,actions.isEmpty()?"No actions linked":done+" of "+actions.size()+" actions done",12,Ui.MUTED));card.setFocusable(true);card.setOnClickListener(v->startActivity(new Intent(this,ResultActivity.class).putExtra("project",p.optLong("_id"))));content.addView(card);Ui.gap(content,8);}
    }
    @Override protected void onSaveInstanceState(Bundle state){super.onSaveInstanceState(state);state.putString("tab",tab);state.putString("filter",filter);if(scroll!=null)positions.put(tab,scroll.getScrollY());for(String key:positions.keySet())state.putInt("scroll_"+key,positions.get(key));}
    @Override protected void onPause(){if(scroll!=null)positions.put(tab,scroll.getScrollY());super.onPause();}
    @Override protected void onDestroy(){store.close();super.onDestroy();}
}
