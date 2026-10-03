package com.rpm.prototype;
import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.widget.RemoteViews;

/** A capture bar: the pill opens Capture ready to type, the mic opens it already listening, the icon opens the planner.
 *  The legacy SQLite CaptureActivity is no longer reachable from here (its entries are copied by LegacyImport). */
public final class RpmWidget extends AppWidgetProvider {
    // Capture and the planner share a task. Without CLEAR_TOP, a tap that matches the task's root intent
    // would only bring the task forward and could show the other screen. Saved data and Capture's draft
    // survive the clear; only an unsaved planner sheet above Capture would be closed.
    private static final int SHOW=Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP;
    // An app update keeps the old buttons until the next onUpdate, so rebind them at once.
    @Override public void onReceive(Context c,Intent intent){
        if(Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())){AppWidgetManager manager=AppWidgetManager.getInstance(c);onUpdate(c,manager,manager.getAppWidgetIds(new ComponentName(c,RpmWidget.class)));}
        else super.onReceive(c,intent);
    }
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager manager,int id,android.os.Bundle options){onUpdate(c,manager,new int[]{id});}
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids) {
        for(int id:ids) {
            RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.widget);
            capture(c,v,R.id.capture,"capture",2);capture(c,v,R.id.voice,"voice",3);
            Intent open=new Intent(c,PlannerActivity.class).setAction("com.rpm.widget.open").addFlags(SHOW);
            v.setOnClickPendingIntent(R.id.open,PendingIntent.getActivity(c,4,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id,v);
        }
    }
    private void capture(Context c,RemoteViews v,int view,String source,int request) {
        // A distinct action keeps each PendingIntent separate.
        Intent i=new Intent(c,CompanionActivity.class).setAction("com.rpm.widget."+source).addFlags(SHOW);
        v.setOnClickPendingIntent(view,PendingIntent.getActivity(c,request,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    }
}
