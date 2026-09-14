package com.rpm.prototype;

import android.app.Instrumentation;
import android.content.*;
import android.net.Uri;
import android.provider.CalendarContract;
import org.json.*;
import java.time.*;

/** Synthetic calendar provider checks live only in the test APK. */
final class PlannerChecks {
    private static int count;
    static void check(boolean good,String message){count++;if(!good)throw new AssertionError(message);}
    static int run(Instrumentation test,Context c)throws Exception{
        ZoneId zone=ZoneId.of("America/New_York");long friday=ZonedDateTime.of(2026,3,6,9,0,0,0,zone).toInstant().toEpochMilli();
        JSONObject e=CompanionChecks.plan(980010,"reminder",friday).put("recurrence","weekdays");long monday=CompanionAlerts.next(e,zone,friday);
        e.put("completedOccurrences",new JSONArray().put(Instant.ofEpochMilli(monday).toString()));
        check(Instant.ofEpochMilli(CompanionAlerts.next(e,zone,friday)).atZone(zone).getDayOfWeek()==DayOfWeek.TUESDAY,"native scheduler skips completed occurrence through DST");
        check(CompanionAlerts.active(e),"per-occurrence completion keeps alert series active");
        c.getSharedPreferences("planner-calendar",0).edit().clear().commit();
        if(!PlannerCalendar.permitted(c))check(PlannerCalendar.read(c,System.currentTimeMillis()).getString("status").equals("permission_needed"),"denied permission is explicit");
        try{PlannerCalendar.read(c,1);throw new AssertionError("invalid date accepted");}catch(IllegalArgumentException expected){check(true,"calendar range validated");}
        Uri calendar=null;ContentResolver resolver=c.getContentResolver();
        test.getUiAutomation().adoptShellPermissionIdentity("android.permission.READ_CALENDAR","android.permission.WRITE_CALENDAR");
        try{
            ContentValues values=new ContentValues();values.put("account_name","RPM planner synthetic QA");values.put("account_type","LOCAL");values.put("name","RPM planner QA");values.put("calendar_displayName","RPM planner QA");values.put("calendar_color",0xff7dd3fc);values.put("calendar_access_level",700);values.put("ownerAccount","RPM planner synthetic QA");values.put("sync_events",1);values.put("visible",1);values.put("calendar_timezone","UTC");
            Uri sync=CalendarContract.Calendars.CONTENT_URI.buildUpon().appendQueryParameter("caller_is_syncadapter","true").appendQueryParameter("account_name","RPM planner synthetic QA").appendQueryParameter("account_type","LOCAL").build();
            calendar=resolver.insert(sync,values);check(calendar!=null,"synthetic calendar created");long id=ContentUris.parseId(calendar),start=LocalDate.now(ZoneOffset.UTC).atTime(10,0).toInstant(ZoneOffset.UTC).toEpochMilli();
            ContentValues event=new ContentValues();event.put("calendar_id",id);event.put("title","Synthetic recurring meeting");event.put("dtstart",start);event.put("duration","PT1H");event.put("eventTimezone","UTC");event.put("rrule","FREQ=DAILY;COUNT=3");event.put("eventStatus",1);event.put("availability",0);check(resolver.insert(CalendarContract.Events.CONTENT_URI,event)!=null,"synthetic recurring event created");
            ContentValues free=new ContentValues();free.put("calendar_id",id);free.put("title","Synthetic free all-day");free.put("dtstart",LocalDate.now(ZoneOffset.UTC).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli());free.put("dtend",LocalDate.now(ZoneOffset.UTC).plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli());free.put("eventTimezone","UTC");free.put("allDay",1);free.put("availability",1);resolver.insert(CalendarContract.Events.CONTENT_URI,free);
            PlannerCalendar.select(c,new JSONArray().put(id));JSONObject read=PlannerCalendar.read(c,start);check(read.getString("status").equals("ready"),"calendar instances provider read succeeds");JSONArray events=read.getJSONArray("events");check(events.length()==4,"bounded instances expand recurring events and include all-day");boolean allDay=false;for(int i=0;i<events.length();i++){JSONObject row=events.getJSONObject(i);if(row.getBoolean("allDay")){allDay=true;check(!row.getBoolean("busy"),"free calendar event is not a conflict");}}check(allDay,"all-day metadata preserved");
            check(read.getLong("end")-read.getLong("start")<=26*86400000L,"calendar copy bounded, not whole year");
            try{PlannerCalendar.select(c,new JSONArray().put(-1));throw new AssertionError("unknown calendar selected");}catch(IllegalArgumentException expected){check(true,"unknown calendar rejected");}
            PlannerCalendar.select(c,new JSONArray());check(PlannerCalendar.read(c,start).getString("status").equals("not_selected"),"disconnect clears selection and cache");
        }finally{if(calendar!=null)resolver.delete(calendar.buildUpon().appendQueryParameter("caller_is_syncadapter","true").appendQueryParameter("account_name","RPM planner synthetic QA").appendQueryParameter("account_type","LOCAL").build(),null,null);c.getSharedPreferences("planner-calendar",0).edit().clear().commit();test.getUiAutomation().dropShellPermissionIdentity();}
        return count;
    }
}
