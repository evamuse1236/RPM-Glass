package com.rpm.prototype;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.RippleDrawable;
import android.view.*;
import android.widget.*;

/** Shared semantic tokens and native, accessible controls. Sizes are dp/sp, never screen pixels. */
final class Ui {
    static int NAVY=0xFF202234, MUTED=0xFF646575, PAPER=0xFFFAF9FC, SURFACE=Color.WHITE,
        ACCENT=0xFF65558F, ON_ACCENT=Color.WHITE, LAVENDER=0xFFEDE7F7, PALE=0xFFEDE7F7,
        ON_CONTAINER=0xFF42335F, OUTLINE=0xFF797584, LINE=0xFFE8E5EE, SUCCESS=0xFF316A50, ERROR=0xFFA83238;
    static boolean dark;
    static void theme(Activity a) {
        dark=(a.getResources().getConfiguration().uiMode&Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES;
        NAVY=dark?0xFFF0EFF7:0xFF202234;MUTED=dark?0xFFB9B9C8:0xFF646575;
        PAPER=dark?0xFF14151C:0xFFFAF9FC;SURFACE=dark?0xFF1D1F2A:Color.WHITE;
        ACCENT=dark?0xFFD0BFFA:0xFF65558F;ON_ACCENT=dark?0xFF30234B:Color.WHITE;
        PALE=LAVENDER=dark?0xFF353044:0xFFEDE7F7;ON_CONTAINER=dark?0xFFE8DDF8:0xFF42335F;
        OUTLINE=dark?0xFF928C9B:0xFF797584;LINE=dark?0xFF343442:0xFFE8E5EE;
        SUCCESS=dark?0xFF9FD5B4:0xFF316A50;ERROR=dark?0xFFFFB3B6:0xFFA83238;
        if(android.os.Build.VERSION.SDK_INT>=30){
            a.getWindow().getDecorView();
            a.getWindow().setDecorFitsSystemWindows(false);
            a.getWindow().getInsetsController().setSystemBarsAppearance(dark?0:WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
        }
        a.getWindow().setStatusBarColor(Color.TRANSPARENT);a.getWindow().setNavigationBarColor(Color.TRANSPARENT);
    }
    static int dp(Context c,float n){return (int)(n*c.getResources().getDisplayMetrics().density+.5f);}
    static GradientDrawable bg(int color,float radius,Context c){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(c,radius));return d;}
    static GradientDrawable outline(Context c,int color,float radius){GradientDrawable d=bg(color,radius,c);d.setStroke(dp(c,1),OUTLINE);return d;}
    static Drawable ripple(Context c,Drawable shape){return new RippleDrawable(ColorStateList.valueOf(dark?0x30FFFFFF:0x1865558F),shape,bg(Color.WHITE,16,c));}
    static LinearLayout column(Context c){LinearLayout l=new LinearLayout(c);l.setOrientation(LinearLayout.VERTICAL);return l;}
    static LinearLayout row(Context c){LinearLayout l=new LinearLayout(c);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    static void pad(View v,int n){padding(v,n,n,n,n);}
    static void padding(View v,int start,int top,int end,int bottom){Context c=v.getContext();v.setPaddingRelative(dp(c,start),dp(c,top),dp(c,end),dp(c,bottom));}
    static void gap(LinearLayout l,int n){View v=new View(l.getContext());l.addView(v,new LinearLayout.LayoutParams(1,dp(l.getContext(),n)));}
    static TextView text(Context c,String value,int sp,int color){TextView t=new TextView(c);t.setText(value);t.setTextSize(sp);t.setTextColor(color);t.setIncludeFontPadding(false);t.setLineSpacing(0,1.22f);return t;}
    static TextView heading(Context c,String value,int sp){TextView t=text(c,value,sp,NAVY);t.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));if(android.os.Build.VERSION.SDK_INT>=28)t.setAccessibilityHeading(true);return t;}
    static Button button(Context c,String label,boolean primary,Runnable action){
        Button b=new Button(c);b.setText(label);b.setTextSize(14);b.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));b.setStateListAnimator(null);b.setAllCaps(false);b.setIncludeFontPadding(false);
        int color=primary?ON_ACCENT:NAVY;b.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},new int[]{MUTED,color}));
        b.setBackground(ripple(c,primary?bg(ACCENT,16,c):outline(c,SURFACE,16)));padding(b,16,12,16,12);
        b.setMinHeight(dp(c,48));b.setMinimumHeight(dp(c,48));b.setMinWidth(0);b.setMinimumWidth(0);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(c,4),0,dp(c,4));b.setLayoutParams(p);b.setOnClickListener(v->action.run());return b;
    }
    static Button textButton(Context c,String label,Runnable action){Button b=button(c,label,false,action);b.setBackground(ripple(c,bg(Color.TRANSPARENT,12,c)));b.setTextColor(ACCENT);return b;}
    static Button chip(Context c,String label,boolean selected,Runnable action){Button b=button(c,label,false,action);b.setBackground(ripple(c,selected?bg(PALE,12,c):outline(c,SURFACE,12)));b.setTextColor(selected?ON_CONTAINER:MUTED);b.setSelected(selected);if(android.os.Build.VERSION.SDK_INT>=30)b.setStateDescription(selected?"Selected":"Not selected");return b;}
    static void selectChip(Button b,boolean selected){Context c=b.getContext();b.setSelected(selected);b.setBackground(ripple(c,selected?bg(PALE,12,c):outline(c,SURFACE,12)));b.setTextColor(selected?ON_CONTAINER:MUTED);if(android.os.Build.VERSION.SDK_INT>=30)b.setStateDescription(selected?"Selected":"Not selected");}
    static Drawable icon(Context c,int resource,int tint){Drawable d=c.getDrawable(resource).mutate();d.setTint(tint);d.setBounds(0,0,dp(c,24),dp(c,24));return d;}
    static ImageView iconView(Context c,int resource,int tint){ImageView i=new ImageView(c);i.setImageDrawable(icon(c,resource,tint));i.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);i.setLayoutParams(new LinearLayout.LayoutParams(dp(c,24),dp(c,24)));return i;}
    static ImageButton iconButton(Context c,int resource,String label,Runnable action){ImageButton b=new ImageButton(c);b.setImageDrawable(icon(c,resource,NAVY));b.setContentDescription(label);b.setTooltipText(label);b.setBackground(ripple(c,bg(Color.TRANSPARENT,24,c)));padding(b,12,12,12,12);b.setLayoutParams(new LinearLayout.LayoutParams(dp(c,48),dp(c,48)));b.setOnClickListener(v->action.run());return b;}
    static void buttonIcon(Button b,int resource,boolean primary){b.setCompoundDrawablesRelative(icon(b.getContext(),resource,primary?ON_ACCENT:NAVY),null,null,null);b.setCompoundDrawablePadding(dp(b.getContext(),8));}
    static EditText input(Context c,String hint){
        EditText e=new EditText(c);e.setImeOptions(android.view.inputmethod.EditorInfo.IME_FLAG_NO_EXTRACT_UI|android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN);e.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(15000)});e.setHint(hint);e.setTextColor(NAVY);e.setHintTextColor(MUTED);e.setTextSize(16);e.setIncludeFontPadding(false);e.setLineSpacing(0,1.2f);
        e.setBackground(outline(c,SURFACE,12));padding(e,16,16,16,16);e.setMinHeight(dp(c,56));
        e.setInputType(android.text.InputType.TYPE_CLASS_TEXT|android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES|android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(c,8),0,dp(c,8));e.setLayoutParams(p);return e;
    }
    static void field(LinearLayout parent,String label,EditText input){TextView name=text(parent.getContext(),label,14,MUTED);input.setId(View.generateViewId());name.setLabelFor(input.getId());parent.addView(name);parent.addView(input);gap(parent,8);}
    static LinearLayout card(Context c){LinearLayout l=column(c);pad(l,16);l.setBackground(bg(SURFACE,16,c));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,dp(c,4),0,dp(c,4));l.setLayoutParams(p);return l;}
    static void weighted(LinearLayout r,View v){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,-2,1);r.addView(v,p);}
    static void hgap(LinearLayout r,int n){r.addView(new View(r.getContext()),new LinearLayout.LayoutParams(dp(r.getContext(),n),1));}
    static void divider(LinearLayout l){View d=new View(l.getContext());d.setBackgroundColor(LINE);l.addView(d,new LinearLayout.LayoutParams(-1,dp(l.getContext(),1)));}
    static LinearLayout toolbar(Activity a,String title,Runnable back){LinearLayout bar=row(a);padding(bar,8,4,8,4);if(back!=null)bar.addView(iconButton(a,R.drawable.ic_back,"Back",back));else hgap(bar,12);TextView t=heading(a,title,22);weighted(bar,t);return bar;}
    static LinearLayout option(Context c,int icon,String title,String subtitle,Runnable action){
        LinearLayout r=row(c);padding(r,16,12,12,12);r.setMinimumHeight(dp(c,64));r.setBackground(ripple(c,bg(SURFACE,12,c)));
        if(icon!=0){r.addView(iconView(c,icon,MUTED));hgap(r,16);}LinearLayout labels=column(c);labels.addView(heading(c,title,16));if(subtitle!=null&&!subtitle.isEmpty()){gap(labels,4);labels.addView(text(c,subtitle,14,MUTED));}weighted(r,labels);hgap(r,12);r.addView(iconView(c,R.drawable.ic_chevron,MUTED));
        r.setFocusable(true);r.setClickable(true);r.setContentDescription(title+(subtitle==null||subtitle.isEmpty()?"":", "+subtitle));r.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);for(int i=0;i<r.getChildCount();i++)r.getChildAt(i).setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);r.setOnClickListener(v->action.run());return r;
    }
    static void section(LinearLayout body,String title){gap(body,24);body.addView(heading(body.getContext(),title,14));gap(body,8);}
    static void insets(Activity a,View root){root.setOnApplyWindowInsetsListener((v,w)->{if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets i=w.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);}else{v.setPadding(w.getSystemWindowInsetLeft(),w.getSystemWindowInsetTop(),w.getSystemWindowInsetRight(),w.getSystemWindowInsetBottom());}return w;});root.requestApplyInsets();}
    static String date(long millis){return new java.text.SimpleDateFormat("EEE, d MMM · h:mm a",java.util.Locale.getDefault()).format(new java.util.Date(millis));}
    static String day(long millis){java.time.LocalDate date=java.time.Instant.ofEpochMilli(millis).atZone(java.time.ZoneId.systemDefault()).toLocalDate();java.time.LocalDate today=java.time.LocalDate.now();if(date.equals(today))return "Today";if(date.equals(today.plusDays(1)))return "Tomorrow";if(date.equals(today.minusDays(1)))return "Yesterday";return new java.text.SimpleDateFormat("EEE, d MMM",java.util.Locale.getDefault()).format(new java.util.Date(millis));}
    static String time(long millis){return android.text.format.DateFormat.format("h:mm a",millis).toString();}
}
