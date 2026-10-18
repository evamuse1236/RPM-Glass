package com.rpm.prototype.notchlab;

import android.app.Activity;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.util.TypedValue;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;

/** Full-screen app under the island: marks every tap it receives, so a tap beside the pill proves touches pass through. */
public final class NotchTouchProbeActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setDecorFitsSystemWindows(false);
        }
        setContentView(new Probe(this));
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.statusBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        }
    }

    private static final class Probe extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private float lastX = -1;
        private float lastY = -1;
        private int taps;

        Probe(Context context) {
            super(context);
            setBackgroundColor(0xFFF0F4F9);
            setContentDescription("Touch probe. Taps that reach this app are marked.");
            paint.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 16, context.getResources().getDisplayMetrics()));
        }

        @Override
        public boolean onTouchEvent(MotionEvent e) {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                lastX = e.getRawX();
                lastY = e.getRawY();
                taps++;
                Log.i(LiveUpdates.TAG, "probe tap reached the app at " + Math.round(lastX) + "," + Math.round(lastY));
                invalidate();
            } else if (e.getActionMasked() == MotionEvent.ACTION_UP) {
                performClick();
            }
            return true;
        }

        @Override
        public boolean performClick() {
            return super.performClick();
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float d = getResources().getDisplayMetrics().density;
            paint.setColor(0xFF1F1F1F);
            String line = taps == 0 ? "Touch probe: no tap has reached the app yet"
                    : "Tap " + taps + " reached the app at " + Math.round(lastX) + ", " + Math.round(lastY);
            canvas.drawText(line, 24 * d, getHeight() / 2f, paint);
            if (taps == 0) return;
            paint.setColor(0xFFB3261E);
            canvas.drawCircle(lastX, lastY, 10 * d, paint);
            paint.setColor(Color.WHITE);
            canvas.drawCircle(lastX, lastY, 4 * d, paint);
        }
    }
}
