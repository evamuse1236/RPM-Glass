package com.rpm.prototype;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import org.json.*;
import java.time.*;
import java.util.*;

/** Read-only, bounded view of calendars already synced by Android. Never writes events. */
final class PlannerCalendar {
    static boolean permitted(Context c){return c.checkSelfPermission(Manifest.permission.READ_CALENDAR)==PackageManager.PERMISSION_GRANTED;}
    static SharedPreferences prefs(Context c){return c.getSharedPreferences("planner-calendar",0);}
    static JSONArray selected(Context c)throws JSONException{return new JSONArray(prefs(c).getString("selected","[]"));}
    static JSONObject calendars(Context c)throws JSONException{
        JSONObject result=new JSONObject().put("permitted",permitted(c)).put("selected",selected(c));JSONArray rows=new JSONArray();result.put("calendars",rows);if(!permitted(c))return result;
        try(Cursor cur=c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI,new String[]{"_id","calendar_displayName","account_type"},"deleted=0",null,"calendar_displayName ASC")){
            if(cur!=null)while(cur.moveToNext()&&rows.length()<60)rows.put(new JSONObject().put("id",cur.getLong(0)).put("title",cur.getString(1)).put("google","com.google".equals(cur.getString(2))));
        }return result;
    }
    static void select(Context c,JSONArray ids)throws JSONException{
        if(ids.length()>60)throw new IllegalArgumentException("Select fewer calendars.");Set<Long> available=new HashSet<>();JSONArray rows=calendars(c).getJSONArray("calendars");for(int i=0;i<rows.length();i++)available.add(rows.getJSONObject(i).getLong("id"));Set<Long> unique=new HashSet<>();for(int i=0;i<ids.length();i++){long id=ids.getLong(i);if(!available.contains(id)||!unique.add(id))throw new IllegalArgumentException("Calendar selection changed. Reopen Calendar.");}
        if(!prefs(c).edit().putString("selected",ids.toString()).remove("cache").commit())throw new IllegalStateException("Could not save calendar choices.");
    }
    static JSONObject read(Context c,long anchor)throws JSONException{
        if(anchor<946684800000L||anchor>7289654400000L)throw new IllegalArgumentException("Choose a date between 2000 and 2200.");
        if(!permitted(c))return new JSONObject().put("status","permission_needed").put("configured",selected(c).length()>0).put("events",new JSONArray());
        JSONArray ids=selected(c);if(ids.length()==0)return new JSONObject().put("status","not_selected").put("events",new JSONArray());
        ZonedDateTime day=Instant.ofEpochMilli(anchor).atZone(ZoneId.systemDefault()).toLocalDate().atStartOfDay(ZoneId.systemDefault());long start=day.minusDays(3).toInstant().toEpochMilli(),end=day.plusDays(22).toInstant().toEpochMilli();
        Uri.Builder uri=CalendarContract.Instances.CONTENT_URI.buildUpon();ContentUris.appendId(uri,start);ContentUris.appendId(uri,end);String[] args=new String[ids.length()];for(int i=0;i<ids.length();i++)args[i]=String.valueOf(ids.getLong(i));String selection="calendar_id IN ("+String.join(",",Collections.nCopies(ids.length(),"?"))+") AND deleted=0 AND (eventStatus IS NULL OR eventStatus!=2)";
        JSONArray events=new JSONArray();boolean truncated=false;
        try(Cursor cur=c.getContentResolver().query(uri.build(),new String[]{"event_id","begin","end","title","calendar_id","allDay","availability"},selection,args,"begin ASC")){
            if(cur==null)throw new IllegalStateException("Calendar provider is unavailable.");while(cur.moveToNext()){
                if(events.length()>=1000){truncated=true;break;}long begin=cur.getLong(1),finish=cur.getLong(2);boolean allDay=cur.getInt(5)!=0;
                if(allDay){begin=Instant.ofEpochMilli(begin).atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();finish=Instant.ofEpochMilli(finish).atZone(ZoneOffset.UTC).toLocalDate().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();}
                events.put(new JSONObject().put("id","calendar-"+cur.getLong(0)+"-"+cur.getLong(1)).put("start",begin).put("end",finish).put("title",cur.isNull(3)?"Calendar commitment":cur.getString(3)).put("calendarId",cur.getLong(4)).put("allDay",allDay).put("busy",cur.getInt(6)!=CalendarContract.Events.AVAILABILITY_FREE));
            }
            JSONObject result=new JSONObject().put("status",truncated?"incomplete":"ready").put("events",events).put("start",start).put("end",end).put("readAt",System.currentTimeMillis()).put("source","Android-synced calendars");prefs(c).edit().putString("cache",result.toString()).apply();return result;
        }catch(RuntimeException failure){String raw=prefs(c).getString("cache",null);if(raw!=null){JSONObject cached=new JSONObject(raw);cached.put("status","stale");return cached;}return new JSONObject().put("status","unavailable").put("events",new JSONArray());}
    }
}
