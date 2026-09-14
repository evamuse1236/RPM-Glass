package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.View;
import android.widget.*;
import org.json.JSONObject;
import org.json.JSONArray;
import java.time.*;
import java.util.*;

/** Dependency-free on-device integration checks against a separate, disposable database. */
public final class OfflineTests extends Instrumentation {
    private int checks;
    private Bundle options;
    private void check(boolean truth,String why){checks++;if(!truth)throw new AssertionError(why);}
    @Override public void onCreate(Bundle args){super.onCreate(args);options=args;start();}
    @Override public void onStart(){
        if(options!=null&&options.containsKey("companion")){CompanionChecks.run(this,options);return;}
        Bundle result=new Bundle();Context c=getTargetContext();String db="rpm-integration-test.db";
        try {
            c.deleteDatabase(db);
            long id;
            try(Store s=new Store(c,db)){
                ContentValues v=new ContentValues();v.put("kind","plan");v.put("raw","Tomorrow at 7 am, go for a run");v.put("title","Morning run");v.put("created",System.currentTimeMillis());v.put("minutes",30);v.put("duration_source","default_estimate");
                id=s.add(v);check(id>0,"insert id");
                ContentValues update=new ContentValues();update.put("minutes",20);update.put("duration_source","chosen_estimate");s.update(id,update,"Correction confirmed: Actually, twenty");
                check(s.get(id).optInt("minutes")==20,"correction persisted");check(s.get(id).optString("raw").equals("Tomorrow at 7 am, go for a run"),"raw immutable through edit");
                check(s.query("SELECT * FROM revisions WHERE entry_id=?",new String[]{""+id}).size()==2,"two snapshots");
                JSONObject first=new JSONObject(s.query("SELECT * FROM revisions ORDER BY _id",null).get(0).optString("snapshot"));check(first.optInt("minutes")==30,"original estimate retained");
                v=new ContentValues();v.put("kind","checkin");v.put("raw","Rested by the window");v.put("title","Rested by the window");v.put("created",System.currentTimeMillis());v.put("duration_source","not_reported");long moment=s.add(v);
                check(s.get(moment).isNull("mood"),"no fabricated mood");check(s.get(moment).isNull("minutes"),"no fabricated actual duration");
                check(s.entries("next").size()==1,"check-in not a planned action");check(s.entries("checkin").size()==1,"check-in history filter");
                ContentValues done=new ContentValues();done.put("done",1);s.update(id,done,"Done");check(s.entries("next").isEmpty(),"completion removes next step");check(s.entries("all").size()==2,"completion keeps history");
                JSONObject export=new JSONObject(s.exportJson());check(export.getJSONArray("entries").length()==2,"export all records");check(export.getJSONArray("revisions").length()==4,"export revisions");
                try{s.update(-123,done,"Missing entry");throw new AssertionError("missing update accepted");}catch(IllegalArgumentException expected){}
                check(s.entries("all").size()==2,"failed transaction preserves records");
                check(s.pendingCount()==8,"every committed entry/revision has an outbox event");
                JSONArray pending=s.pendingBatch();check(pending.toString().equals(s.pendingBatch().toString()),"retry keeps stable event identities");
                JSONArray one=new JSONArray().put(pending.getJSONObject(0).getString("eventId"));
                try{SyncManager.validateAck(pending,one);throw new AssertionError("partial acknowledgement accepted");}catch(org.json.JSONException expected){}
                JSONArray all=new JSONArray();for(int k=0;k<pending.length();k++)all.put(pending.getJSONObject(k).getString("eventId"));SyncManager.validateAck(pending,all);
                s.acknowledge(one);check(s.pendingCount()==7,"ack removes only identified event");
                String installation=s.installationId();check(installation.matches("[a-f0-9-]{36}"),"stable installation identity exists");
                ContentValues forbidden=new ContentValues();forbidden.put("raw","changed");try{s.update(id,forbidden,"rewrite");throw new AssertionError("raw rewrite accepted");}catch(IllegalArgumentException expected){}
                check(s.pendingCount()==7,"failed edits do not create uploads");
                check(SyncManager.validateUrl("https://example-deployment.convex.site/").equals("https://example-deployment.convex.site"),"HTTPS Convex endpoint validation");
                for(String invalid:new String[]{"http://example.convex.site","https://example.convex.site.evil.com","https://user:pass@example.convex.site","https://example.convex.site/path","https://example.convex.site?token=x"}){
                    try{SyncManager.validateUrl(invalid);throw new AssertionError("bad endpoint accepted");}catch(IllegalArgumentException expected){}check(true,"reject unsafe sync destination");
                }
            }
            try(Store reopened=new Store(c,db)){check(reopened.get(id).optInt("minutes")==20,"reopen persistence");check(reopened.entries("all").size()==2,"reopen count");check(reopened.pendingCount()==7,"outbox persists across reopen");}
            CaptureParser.Parsed parsed=CaptureParser.parse("Tomorrow at 7 am, go for a run",ZonedDateTime.of(2026,9,8,14,0,0,0,ZoneId.of("Asia/Kolkata")));
            check(parsed.plannedAt!=null&&parsed.minutes==30,"parser on Android");check(CaptureParser.correctionMinutes("Actually, twenty")==20,"correction on Android");
            final Throwable[] problem={null};runOnMainSync(()->{try{
                RemoteViews remote=new RemoteViews(c.getPackageName(),R.layout.widget);View widget=remote.apply(c,new FrameLayout(c));
                check(widget.findViewById(R.id.checkin)!=null,"widget Check in target");check(widget.findViewById(R.id.capture)!=null,"widget Capture target");check(widget.findViewById(R.id.remind)!=null,"widget Remind target");check(widget.findViewById(R.id.open)!=null,"widget Open target");
                check(Reminders.intent(c,90001).equals(Reminders.intent(c,90001)),"stable reminder identity");check(!Reminders.intent(c,90001).equals(Reminders.intent(c,90002)),"independent reminder identities");
                Reminders.schedule(c,90001,System.currentTimeMillis()+3600000);Reminders.cancel(c,90001);check(true,"inexact scheduling and cancel without exact permission");
                check(!Reminders.intent(c,90001).equals(Alarms.trigger(c,90001)),"alarm and reminder cannot replace each other");
            }catch(Throwable t){problem[0]=t;}});if(problem[0]!=null)throw new AssertionError(problem[0]);
            result.putString("stream","PASS: "+checks+" on-device persistence, revision, export, parser, widget and reminder checks\n");finish(Activity.RESULT_OK,result);
        }catch(Throwable t){result.putString("stream","FAIL after "+checks+" checks: "+android.util.Log.getStackTraceString(t));finish(Activity.RESULT_CANCELED,result);}
        finally{c.deleteDatabase(db);}
    }
}
