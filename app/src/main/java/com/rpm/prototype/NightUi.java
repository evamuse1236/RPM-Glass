package com.rpm.prototype;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.view.*;
import android.widget.*;

/** Native companion controls follow the Frosted Night conversation, without global Ui state. */
final class NightUi {
    static final int BACKGROUND=0xff121821,TEXT=0xfff4f7fa,MUTED=0xffb4c0ce,ACCENT=0xff7dd3fc,LINE=0xff354152;
    private static Typeface body,semibold,display;
    static Typeface font(Context c,boolean heading){if(body==null){body=Typeface.createFromAsset(c.getAssets(),"companion/jakarta-regular.ttf");semibold=Typeface.createFromAsset(c.getAssets(),"companion/jakarta-semibold.ttf");display=Typeface.createFromAsset(c.getAssets(),"companion/space-semibold.ttf");}return heading?semibold:body;}
    static int dp(Context c,int n){return Math.round(n*c.getResources().getDisplayMetrics().density);}
    static void pad(View v,int x,int y){v.setPadding(dp(v.getContext(),x),dp(v.getContext(),y),dp(v.getContext(),x),dp(v.getContext(),y));}
    static LinearLayout column(Context c){LinearLayout l=new LinearLayout(c);l.setOrientation(LinearLayout.VERTICAL);return l;}
    static TextView text(Context c,String value,int size,int color){TextView t=new TextView(c);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setTypeface(font(c,false));t.setIncludeFontPadding(false);t.setLineSpacing(0,1.18f);return t;}
    static GradientDrawable shape(Context c,int fill,int radius){GradientDrawable d=new GradientDrawable();d.setColor(fill);d.setCornerRadius(dp(c,radius));return d;}
    static RippleDrawable ripple(Context c){return new RippleDrawable(ColorStateList.valueOf(0x307dd3fc),shape(c,0,12),shape(c,0xffffffff,12));}
    static void section(LinearLayout box,String title){TextView t=text(box.getContext(),title,18,TEXT);t.setTypeface(font(box.getContext(),true));t.setPadding(0,dp(box.getContext(),28),0,dp(box.getContext(),8));if(android.os.Build.VERSION.SDK_INT>=28)t.setAccessibilityHeading(true);box.addView(t);}
    static void note(LinearLayout box,String value){TextView t=text(box.getContext(),value,13,MUTED);t.setPadding(0,dp(box.getContext(),8),0,dp(box.getContext(),8));box.addView(t);}
    static void row(LinearLayout box,String title,String detail,Runnable action){Context c=box.getContext();LinearLayout row=new LinearLayout(c);row.setGravity(Gravity.CENTER_VERTICAL);pad(row,0,14);row.setMinimumHeight(dp(c,64));row.setBackground(ripple(c));row.setFocusable(true);row.setClickable(true);row.setOnClickListener(v->action.run());LinearLayout labels=column(c);TextView label=text(c,title,15,TEXT);label.setTypeface(font(c,true));labels.addView(label);if(detail!=null&&!detail.isEmpty()){TextView subtitle=text(c,detail,13,MUTED);subtitle.setPadding(0,dp(c,4),dp(c,8),0);labels.addView(subtitle);}row.addView(labels,new LinearLayout.LayoutParams(0,-2,1));ImageView arrow=new ImageView(c);arrow.setImageResource(R.drawable.ic_chevron);arrow.setColorFilter(MUTED);row.addView(arrow,new LinearLayout.LayoutParams(dp(c,24),dp(c,24)));row.setContentDescription(title+(detail==null?"":", "+detail));labels.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);arrow.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);box.addView(row);View line=new View(c);line.setBackgroundColor(LINE);box.addView(line,new LinearLayout.LayoutParams(-1,dp(c,1)));}
    static LinearLayout toolbar(Activity a){LinearLayout bar=new LinearLayout(a);bar.setGravity(Gravity.CENTER_VERTICAL);ImageButton back=new ImageButton(a);back.setImageResource(R.drawable.ic_back);back.setColorFilter(TEXT);back.setBackground(ripple(a));back.setContentDescription("Back to conversation");back.setOnClickListener(v->a.finish());bar.addView(back,new LinearLayout.LayoutParams(dp(a,48),dp(a,48)));TextView title=text(a,"Settings",26,TEXT);font(a,false);title.setTypeface(display);bar.addView(title);pad(bar,8,8);return bar;}
}
