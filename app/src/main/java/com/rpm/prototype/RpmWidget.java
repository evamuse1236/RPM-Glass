package com.rpm.prototype;
import android.app.PendingIntent;
import android.appwidget.*;
import android.content.*;
import android.widget.RemoteViews;

public final class RpmWidget extends AppWidgetProvider {
    @Override public void onAppWidgetOptionsChanged(Context c,AppWidgetManager manager,int id,android.os.Bundle options){onUpdate(c,manager,new int[]{id});}
    @Override public void onUpdate(Context c,AppWidgetManager manager,int[] ids) {
        for(int id:ids) {
            RemoteViews v=new RemoteViews(c.getPackageName(),R.layout.widget);
            bind(c,v,R.id.checkin,"checkin",1);bind(c,v,R.id.capture,"capture",2);bind(c,v,R.id.remind,"remind",3);
            Intent open=new Intent(c,MainActivity.class);
            v.setOnClickPendingIntent(R.id.open,PendingIntent.getActivity(c,4,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id,v);
        }
    }
    private void bind(Context c,RemoteViews v,int view,String mode,int request) {
        Intent i=new Intent(c,CaptureActivity.class).putExtra("mode",mode).setAction("com.rpm."+mode).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);
        v.setOnClickPendingIntent(view,PendingIntent.getActivity(c,request,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
    }
}
