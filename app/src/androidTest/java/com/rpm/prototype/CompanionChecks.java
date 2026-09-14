package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.time.*;

/** Test-APK-only checks. No test hook or credential importer exists in the shipped app. */
final class CompanionChecks {
    private static int checks;
    private static void check(boolean good,String message){checks++;if(!good)throw new AssertionError(message);}
    static JSONObject fresh()throws Exception{return new JSONObject().put("schema",2).put("version",1).put("entries",new JSONArray()).put("memories",new JSONArray()).put("history",new JSONArray()).put("conversations",new JSONArray().put(new JSONObject().put("id","synthetic-phone-test").put("title","New conversation").put("messages",new JSONArray()).put("archived",false))).put("pending",JSONObject.NULL).put("undo",JSONObject.NULL);}
    static JSONObject plan(long id,String type,long at)throws Exception{return new JSONObject().put("id",id).put("title","Synthetic phone test "+id).put("raw","Synthetic verification only").put("kind","plan").put("planned",Instant.ofEpochMilli(at).toString()).put("state","active").put("done",false).put("archived",false).put("alertIntent",new JSONObject().put("type",type)).put("revisions",new JSONArray());}
    static void run(Instrumentation test,Bundle args){Bundle result=new Bundle();Context real=test.getTargetContext();
        try{
            if(args.getString("companion").equals("configure")){
                try(InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(test.getUiAutomation().executeShellCommand("cat /data/local/tmp/rpm-companion-test-key.env"))){String source=CompanionStore.readText(in);java.util.regex.Matcher m=java.util.regex.Pattern.compile("(?m)^(?:export )?(?:OPENROUTER_API_KEY|RPM_OPENROUTER_API_KEY)\\s*=\\s*[\"']?([^\\s\"']+)").matcher(source);if(!m.find())throw new IllegalStateException("No test key found.");CompanionKey.set(real,m.group(1));}check(CompanionKey.has(real),"key encrypted on emulator");
            }else if(args.getString("companion").equals("remove-key")){CompanionKey.set(real,null);check(!CompanionKey.has(real),"test key removed");}
            else if(args.getString("companion").equals("ring-fixture")){
                JSONObject d=CompanionStore.read(real);if(d==null)d=fresh();long id=990001;check(CompanionAlerts.entry(d,id)==null,"fixture ID is unused");d.getJSONArray("entries").put(plan(id,"alarm",System.currentTimeMillis()+15000));d.put("version",d.optInt("version")+1);CompanionStore.write(real,d,d.optInt("version")-1);check(CompanionAlerts.ledger(real).getJSONObject("990001").optString("status").equals("scheduled"),"real exact alarm scheduled for synthetic fixture");
            }else if(args.getString("companion").equals("cleanup-fixture")){
                JSONObject d=CompanionStore.read(real);if(d!=null){JSONArray a=d.getJSONArray("entries"),keep=new JSONArray();for(int i=0;i<a.length();i++)if(a.getJSONObject(i).optLong("id")!=990001)keep.put(a.get(i));d.put("entries",keep).put("version",d.optInt("version")+1);CompanionStore.write(real,d,d.optInt("version")-1);}
            }else{
                // Isolated files and ledger; alarm PendingIntents use synthetic IDs only.
                Context c=new ContextWrapper(real){@Override public File getFilesDir(){File f=new File(real.getFilesDir(),"companion-checks");f.mkdirs();return f;}@Override public SharedPreferences getSharedPreferences(String name,int mode){return real.getSharedPreferences("test-"+name,mode);}};
                File store=CompanionStore.file(c);try{
                    if(store.exists())throw new IllegalStateException("Previous test files need inspection before reuse.");
                    checks+=SoundChecks.run(test,c);
                    checks+=PlannerChecks.run(test,c);
                    CompanionControls.apply(c,new JSONObject().put("action","transparency").put("value",40));check(CompanionControls.read(c).getInt("transparency")==40,"AI appearance setting persisted through shared native control");
                    check(!CompanionControls.read(c).has("key")&&!CompanionControls.read(c).has("encrypted"),"app settings tool exposes no key material");
                    try{CompanionControls.apply(c,new JSONObject().put("action","transparency").put("value",99));throw new AssertionError("invalid transparency accepted");}catch(IllegalArgumentException expected){check(CompanionControls.read(c).getInt("transparency")==40,"invalid appearance control changes nothing");}
                    try{CompanionControls.apply(c,new JSONObject().put("action","shell"));throw new AssertionError("arbitrary native control accepted");}catch(IllegalArgumentException expected){check(true,"native control allowlist enforced");}
                    JSONObject d=fresh();long future=System.currentTimeMillis()+3600000;JSONObject a=plan(980001,"reminder",future),b=plan(980002,"alarm",future+600000);d.getJSONArray("entries").put(a).put(b);
                    CompanionStore.write(c,d,0);check(CompanionStore.read(c).getJSONArray("entries").length()==2,"private atomic store readback");
                    JSONObject oversized=fresh().put("padding","x".repeat(16*1024*1024));try{CompanionStore.writeRaw(c,oversized);throw new AssertionError("oversized store written");}catch(IOException expected){check(CompanionStore.read(c).getInt("version")==1,"oversized write rejected before touching original");}
                    try{CompanionStore.write(c,d,0);throw new AssertionError("stale save accepted");}catch(IOException expected){check(true,"stale save rejected");}
                    check(CompanionAlerts.planned(a)==future,"schedule is planned time, not CLI early lead");
                    check(!CompanionAlerts.trigger(c,980001,0).equals(CompanionAlerts.trigger(c,980002,0)),"independent pending intent identities");
                    JSONObject l=CompanionAlerts.ledger(c);String status=l.getJSONObject("980002").getString("status");check(status.equals(CompanionAlerts.exact(c)&&CompanionAlerts.notifications(c,CompanionAlerts.ALARMS)?"scheduled":"permission_needed"),"exact permission gates alarms honestly");
                    CompanionAlerts.disarmImport(c,d);CompanionAlerts.reconcile(c,d,true);check(CompanionAlerts.ledger(c).getJSONObject("980001").getString("status").equals("imported_not_armed"),"restore cannot arm imported history");
                    b.put("planned",Instant.ofEpochMilli(future+1200000).toString());CompanionAlerts.reconcile(c,d,false);check(CompanionAlerts.ledger(c).getJSONObject("980002").getString("status").equals("imported_not_armed"),"editing imported time does not silently arm its alarm");
                    CompanionAlerts.arm(c,980001);check(!CompanionAlerts.ledger(c).getJSONObject("980001").getString("status").equals("imported_not_armed"),"explicit per-entry arming");
                    a.put("archived",true);d.put("version",2);CompanionStore.write(c,d,1);check(CompanionAlerts.ledger(c).getJSONObject("980001").getString("status").equals("off"),"archive cancels reminder");
                    a.put("archived",false);d.put("version",3);CompanionStore.write(c,d,2);check(!CompanionAlerts.ledger(c).getJSONObject("980001").getString("status").equals("off"),"undo-like restore reconciles schedule");
                    String before=CompanionAlerts.ledger(c).toString();CompanionAlerts.fired(c,980001,future-1);check(before.equals(CompanionAlerts.ledger(c).toString()),"stale delivery ignored after edit");
                    if(CompanionAlerts.notifications(c,CompanionAlerts.REMINDERS)){CompanionAlerts.fired(c,980001,future);check(CompanionAlerts.ledger(c).getJSONObject("980001").optString("status").equals("posted"),"native notification actually posted");boolean found=false;for(android.service.notification.StatusBarNotification n:c.getSystemService(NotificationManager.class).getActiveNotifications())if(n.getId()==980001)found=true;check(found,"notification visible to Android notification manager");}
                    ZoneId zone=ZoneId.of("America/New_York");long friday=ZonedDateTime.of(2026,3,6,9,0,0,0,zone).toInstant().toEpochMilli();long monday=CompanionAlerts.next(friday,"weekdays",zone,friday+1);ZonedDateTime next=Instant.ofEpochMilli(monday).atZone(zone);check(next.getDayOfWeek()==DayOfWeek.MONDAY&&next.getHour()==9,"weekdays skip weekend and retain clock across DST");check(CompanionAlerts.next(friday,"",zone,friday+1)==0,"expired one-off is not replayed");
                    check(Instant.ofEpochMilli(CompanionAlerts.next(friday+86400000,"weekdays",zone,friday)).atZone(zone).getDayOfWeek()==DayOfWeek.MONDAY,"future weekday series cannot start on Saturday");
                    d.put("planner",new JSONObject().put("schema",1).put("undo",new JSONObject().put("synthetic",true)));CompanionStore.importCopy(c,d);check(CompanionStore.read(c).isNull("undo"),"import clears cross-store undo");check(CompanionStore.read(c).getJSONObject("planner").isNull("undo"),"import clears planning undo from other store");check(CompanionAlerts.ledger(c).getJSONObject("980002").optString("status").equals("imported_not_armed"),"imported ringing alarm is disarmed");check(c.getFilesDir().listFiles((dir,name)->name.startsWith("companion-before-import-")).length==1,"pre-import backup is recoverable");
                    CompanionKey.set(c,"synthetic-key-for-encryption-roundtrip-only");check(CompanionKey.get(c).equals("synthetic-key-for-encryption-roundtrip-only"),"Keystore encryption roundtrip");check(!c.getSharedPreferences("companion-key",0).getString("encrypted","").contains("synthetic-key"),"plaintext key never stored");CompanionKey.set(c,null);
                    check(CompanionStore.file(real).getParentFile().equals(real.getFilesDir()),"original companion outside isolated test folder");
                }finally{CompanionAlerts.cancelAll(c);c.getSharedPreferences("companion-delivery",0).edit().clear().commit();for(File f:c.getFilesDir().listFiles())if(f.getName().equals("companion.json")||f.getName().startsWith("companion-before-import-"))f.delete();}
            }
            result.putString("stream","PASS: "+checks+" companion Android checks ("+args.getString("companion")+")\n");test.finish(Activity.RESULT_OK,result);
        }catch(Throwable e){result.putString("stream","FAIL after "+checks+" checks: "+android.util.Log.getStackTraceString(e));test.finish(Activity.RESULT_CANCELED,result);}
    }
}
