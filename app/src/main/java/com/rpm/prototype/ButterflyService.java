package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.graphics.PixelFormat;
import android.graphics.drawable.BitmapDrawable;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.ImageView;

/** User-started, visible and recoverably dismissible. Never auto-enables at boot. */
public final class ButterflyService extends Service {
    private static ButterflyService running;private static boolean ownAppVisible;
    static void appVisible(boolean visible){ownAppVisible=visible;ButterflyService s=running;if(s!=null&&s.butterfly!=null)s.butterfly.setVisibility(visible?View.GONE:View.VISIBLE);}
    private WindowManager wm;private ImageView butterfly;private WindowManager.LayoutParams params;
    @Override public IBinder onBind(Intent i){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&"hide".equals(intent.getAction())||!Settings.canDrawOverlays(this)){stopSelf();return START_NOT_STICKY;}
        NotificationManager n=getSystemService(NotificationManager.class);n.createNotificationChannel(new NotificationChannel("rpm_butterfly","Floating butterfly",NotificationManager.IMPORTANCE_LOW));
        PendingIntent hide=PendingIntent.getService(this,0,new Intent(this,ButterflyService.class).setAction("hide"),PendingIntent.FLAG_IMMUTABLE);
        startForeground(81002,new Notification.Builder(this,"rpm_butterfly").setSmallIcon(R.drawable.ic_checkin).setContentTitle("RPM butterfly is available").setContentText("Tap the butterfly to chat. You can hide it here.").setContentIntent(CompanionAlerts.open(this,0)).setOngoing(true).addAction(new Notification.Action.Builder(null,"Hide butterfly",hide).build()).build());
        running=this;if(butterfly==null)show();return START_NOT_STICKY;
    }
    private void show(){wm=getSystemService(WindowManager.class);int size=(int)(64*getResources().getDisplayMetrics().density);butterfly=new ImageView(this);BitmapDrawable drawable=(BitmapDrawable)getDrawable(R.drawable.butterfly);drawable.setFilterBitmap(false);butterfly.setImageDrawable(drawable);butterfly.setContentDescription("RPM butterfly. Tap to chat; drag to move; long press to hide.");butterfly.setBackground(CompanionSettingsActivity.pixelBackground(0xff121821));butterfly.setPadding(0,0,0,0);butterfly.setElevation(8);butterfly.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        params=new WindowManager.LayoutParams(size,size,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL|WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,PixelFormat.TRANSLUCENT);params.gravity=Gravity.TOP|Gravity.LEFT;
        params.setTitle("RPM butterfly");if(Build.VERSION.SDK_INT>=30)params.setFitInsetsTypes(0);
        android.content.SharedPreferences p=getSharedPreferences("butterfly-position",0);params.x=p.getInt("x",getResources().getDisplayMetrics().widthPixels-size-24);params.y=p.getInt("y",getResources().getDisplayMetrics().heightPixels-size-220);clamp();
        butterfly.setOnClickListener(v->{startActivity(new Intent(this,CompanionActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_SINGLE_TOP));});butterfly.setOnLongClickListener(v->{stopSelf();return true;});
        butterfly.setOnTouchListener(new View.OnTouchListener(){float downX,downY;int x,y;boolean moved;public boolean onTouch(View v,android.view.MotionEvent e){switch(e.getActionMasked()){case MotionEvent.ACTION_DOWN:downX=e.getRawX();downY=e.getRawY();x=params.x;y=params.y;moved=false;return false;case MotionEvent.ACTION_MOVE:if(Math.hypot(e.getRawX()-downX,e.getRawY()-downY)>ViewConfiguration.get(ButterflyService.this).getScaledTouchSlop())moved=true;if(moved){v.cancelLongPress();params.x=x+(int)(e.getRawX()-downX);params.y=y+(int)(e.getRawY()-downY);clamp();wm.updateViewLayout(butterfly,params);return true;}return false;case MotionEvent.ACTION_UP:if(moved){v.setPressed(false);getSharedPreferences("butterfly-position",0).edit().putInt("x",params.x).putInt("y",params.y).apply();return true;}return false;default:return false;}}});
        butterfly.setVisibility(ownAppVisible?View.GONE:View.VISIBLE);try{wm.addView(butterfly,params);}catch(RuntimeException e){butterfly=null;stopSelf();}
    }
    private void clamp(){android.util.DisplayMetrics m=getResources().getDisplayMetrics();int left=0,right=0,top=Math.round(28*m.density),bottom=Math.round(32*m.density);if(Build.VERSION.SDK_INT>=30){android.graphics.Insets insets=wm.getMaximumWindowMetrics().getWindowInsets().getInsetsIgnoringVisibility(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());left=insets.left;right=insets.right;top=insets.top;bottom=insets.bottom;}params.x=Math.max(left,Math.min(params.x,m.widthPixels-right-params.width));params.y=Math.max(top,Math.min(params.y,m.heightPixels-bottom-params.height));}
    @Override public void onConfigurationChanged(android.content.res.Configuration c){super.onConfigurationChanged(c);if(butterfly!=null){clamp();wm.updateViewLayout(butterfly,params);}}
    @Override public void onDestroy(){if(butterfly!=null){wm.removeView(butterfly);butterfly=null;}if(running==this)running=null;stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
}
