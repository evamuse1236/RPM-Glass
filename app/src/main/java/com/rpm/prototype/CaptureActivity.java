package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import org.json.JSONObject;
import java.time.ZonedDateTime;

public final class CaptureActivity extends Activity {
    private Store store;
    private EditText input;
    private LinearLayout body,saved,extras;
    private String mode,purpose="",mood=null,energy=null;
    private Integer duration=null;
    private long latest=-1;
    private String draft="";
    private boolean details=false;
    private boolean suggestionDismissed=false;
    private Button more,purposeButton,durationButton,moodButton,energyButton;
    private static final String[] MOODS={"Not recorded","Low","Uneasy","Okay","Good","Great"};
    private static final String[] ENERGIES={"Not recorded","Low","Medium","High"};
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);Ui.theme(this);store=new Store(this);mode=getIntent().getStringExtra("mode");if(mode==null)mode="capture";
        if(state!=null){replyDraft=state.getString("replyDraft","");prompt=state.getString("prompt","");reply=state.getString("reply","");question=state.getString("question","");promptTarget=state.getLong("promptTarget",-1);alertAt=state.getLong("alertAt");ringing=state.getBoolean("ringing");correctionRaw=state.getString("correctionRaw","");correctionValue=state.getInt("correctionValue");latest=state.getLong("latest",-1);draft=state.getString("draft","");purpose=state.getString("purpose","");mood=state.getString("mood");energy=state.getString("energy");if(state.containsKey("duration"))duration=state.getInt("duration");details=state.getBoolean("details");suggestionDismissed=state.getBoolean("suggestionDismissed");}
        else {
            android.content.SharedPreferences prefs=getPreferences(0);
            draft=prefs.getString("draft_"+mode,"");purpose=prefs.getString("purpose_"+mode,"");
            mood=prefs.getString("mood_"+mode,null);energy=prefs.getString("energy_"+mode,null);
            if(prefs.contains("duration_"+mode))duration=prefs.getInt("duration_"+mode,30);
        }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        render();
        input.requestFocus();input.postDelayed(()->((InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(input,InputMethodManager.SHOW_IMPLICIT),250);
    }
    private boolean checkin(){return "checkin".equals(mode);}
    private void render(){
        Ui.theme(this);boolean compact=getResources().getConfiguration().screenHeightDp<500;
        FrameLayout root=new FrameLayout(this);root.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        LinearLayout sheet=Ui.column(this);sheet.setBackground(Ui.bg(Ui.SURFACE,24,this));
        LinearLayout head=Ui.row(this);Ui.padding(head,8,8,16,0);
        head.addView(Ui.iconButton(this,R.drawable.ic_close,"Close capture",this::finish));Ui.hgap(head,8);
        Ui.weighted(head,Ui.heading(this,checkin()?"Check in":"remind".equals(mode)?"Remind":"Capture",22));
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setVerticalScrollBarEnabled(false);
        body=Ui.column(this);Ui.padding(body,20,8,20,8);scroll.addView(body);
        saved=Ui.column(this);body.addView(saved);showSaved();
        conversation=Ui.column(this);body.addView(conversation);
        input=Ui.input(this,latest>0?"Another thought, or a correction…":checkin()?"What have you been doing?":"A thought or a next step…");
        input.setBackgroundColor(android.graphics.Color.TRANSPARENT);Ui.padding(input,0,8,0,8);
        input.setTextSize(20);input.setGravity(Gravity.TOP|Gravity.START);input.setMinLines(latest>0?2:3);input.setMaxLines(5);input.setText(draft);
        input.setContentDescription(checkin()?"Check-in text":"Thought");body.addView(input);
        LinearLayout choices=Ui.row(this);
        if(checkin()){
            Button m=Ui.chip(this,mood==null?"Mood":mood,mood!=null,()->ask("mood",-1,"How do you feel? Tap a reply or type a mood."));moodButton=m;
            Button en=Ui.chip(this,energy==null?"Energy":energy,energy!=null,()->ask("energy",-1,"How is your energy? Tap or type Low, Medium, or High."));energyButton=en;
            Ui.weighted(choices,m);Ui.hgap(choices,8);Ui.weighted(choices,en);
        }else{
            durationButton=Ui.chip(this,durationLabel(),duration!=null,this::chooseDuration);Ui.weighted(choices,durationButton);Ui.hgap(choices,8);
            purposeButton=Ui.chip(this,purpose.isEmpty()?"Purpose":"Purpose added",!purpose.isEmpty(),()->ask("purpose",-1,"What makes this matter? Tap a purpose or type your own."));Ui.weighted(choices,purposeButton);
        }
        body.addView(choices);
        LinearLayout footer=Ui.row(this);if(!compact)Ui.padding(footer,20,8,20,16);
        if(checkin()){
            Button options=Ui.textButton(this,"Details",()->ask("details",-1,"What would you like to add to this check-in?"));
            if(compact)body.addView(options);else{footer.addView(options,new LinearLayout.LayoutParams(-2,-2));Ui.hgap(footer,16);}
        }else if(!compact){TextView hint=Ui.text(this,latest>0?"Ready for the next one":"Saved on this phone",12,Ui.MUTED);Ui.weighted(footer,hint);Ui.hgap(footer,12);}
        Button save=Ui.button(this,latest>0?"Save next":checkin()?"Save check-in":"remind".equals(mode)?"Save & remind":"Save thought",true,()->save(false));
        if(compact){Ui.hgap(head,8);head.addView(save,new LinearLayout.LayoutParams(-2,-2));}else if(checkin())Ui.weighted(footer,save);else footer.addView(save,new LinearLayout.LayoutParams(-2,-2));
        ComposerSheet measured=new ComposerSheet(head,scroll,footer);measured.setBackground(Ui.bg(Ui.SURFACE,24,this));
        int width=getResources().getConfiguration().screenWidthDp>600?Ui.dp(this,560):-1;
        FrameLayout.LayoutParams params=new FrameLayout.LayoutParams(width,-2,Gravity.BOTTOM|Gravity.CENTER_HORIZONTAL);params.topMargin=Ui.dp(this,16);root.addView(measured,params);
        setContentView(root);Ui.insets(this,root);showConversation();
    }
    /** Measures scrollable content after reserving the real header/footer heights, including large text. */
    private final class ComposerSheet extends LinearLayout {
        private final View header,footer;private final ScrollView middle;
        ComposerSheet(View header,ScrollView middle,View footer){super(CaptureActivity.this);setOrientation(VERTICAL);this.header=header;this.middle=middle;this.footer=footer;addView(header);addView(middle,new LinearLayout.LayoutParams(-1,-2));addView(footer);}
        @Override protected void onMeasure(int widthSpec,int heightSpec){
            int width=MeasureSpec.makeMeasureSpec(MeasureSpec.getSize(widthSpec),MeasureSpec.EXACTLY);int free=MeasureSpec.makeMeasureSpec(0,MeasureSpec.UNSPECIFIED);
            header.measure(width,free);footer.measure(width,free);
            int available=Math.max(0,MeasureSpec.getSize(heightSpec)-header.getMeasuredHeight()-footer.getMeasuredHeight());
            middle.measure(width,MeasureSpec.makeMeasureSpec(available,MeasureSpec.AT_MOST));middle.getLayoutParams().height=middle.getMeasuredHeight();
            super.onMeasure(widthSpec,heightSpec);
        }
    }
    private String durationLabel(){return duration==null?(checkin()?"Actual minutes":"30 min estimate"):(checkin()?duration+" min actual":duration+" min estimate");}
    // Follow-up choices stay inside the composer. Android owns only permissions and time pickers.
    private String prompt="",reply="",question="",correctionRaw="";
    private long promptTarget=-1,alertAt=0;
    private int correctionValue=0;
    private boolean ringing=false;
    private LinearLayout conversation;
    private EditText replyInput;
    private String replyDraft="";
    private void ask(String kind,long target,String text){
        prompt=kind;promptTarget=target;question=text;reply="";replyDraft="";showConversation();
    }
    private void answered(String answer,String response){replyDraft="";reply=answer;question=response;prompt="";showSaved();showConversation();if(input!=null){input.requestFocus();input.setSelection(input.length());}}
    private void bubble(String text,boolean mine){
        if(text.isEmpty())return;TextView t=Ui.text(this,text,15,mine?Ui.ON_CONTAINER:Ui.NAVY);Ui.pad(t,12);t.setBackground(Ui.bg(mine?Ui.PALE:Ui.PAPER,16,this));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(mine?Ui.dp(this,32):0,Ui.dp(this,4),mine?0:Ui.dp(this,24),Ui.dp(this,4));conversation.addView(t,p);
    }
    private void choice(ViewGroup list,String label,Runnable action){Button b=Ui.button(this,label,false,action);b.setBackground(Ui.ripple(this,Ui.bg(Ui.PALE,16,this)));b.setTextColor(Ui.ON_CONTAINER);list.addView(b,new ViewGroup.LayoutParams(-2,-2));}
    private void showConversation(){
        if(conversation==null)return;if(input!=null)input.setMinLines(question.isEmpty()&&latest<1?3:2);conversation.removeAllViews();replyInput=null;bubble(reply,true);bubble(question,false);
        if(prompt.isEmpty())return;
        ReplyFlow options=new ReplyFlow();conversation.addView(options);
        switch(prompt){
            case "mood":for(String value:MOODS)choice(options,value,()->setFeeling(true,value));break;
            case "energy":for(String value:ENERGIES)choice(options,value,()->setFeeling(false,value));break;
            case "duration":
                for(int n:new int[]{15,20,30})choice(options,n+" min",()->applyMinutes(n));
                choice(options,"Clear duration",()->applyMinutes(null));break;
            case "purpose":
                choice(options,"No purpose",()->applyPurpose(""));
                for(JSONObject p:store.query("SELECT DISTINCT purpose FROM entries WHERE purpose<>'' UNION SELECT purpose FROM projects WHERE purpose<>'' LIMIT 4",null)){String v=p.optString("purpose");choice(options,v,()->applyPurpose(v));}break;
            case "details":
                choice(options,"Duration",()->ask("duration",promptTarget,durationQuestion()));
                choice(options,"Purpose",()->ask("purpose",promptTarget,"What makes this matter? Tap a purpose or type your own."));
                if(checkin()){choice(options,"Mood",()->ask("mood",promptTarget,"How do you feel? Tap or type a mood."));choice(options,"Energy",()->ask("energy",promptTarget,"How is your energy? Tap or type Low, Medium, or High."));}
                if(promptTarget>0){choice(options,"Edit title",()->ask("title",promptTarget,"What should the title be? Your original input will stay in history."));choice(options,"Open entry",()->startActivity(new Intent(this,EntryActivity.class).putExtra("entry",promptTarget)));}break;
            case "correction":
                choice(options,"Update duration",this::confirmCorrection);
                choice(options,"Save as new",()->{input.setText(correctionRaw);prompt="";save(true);});break;
            case "alert":
                choice(options,"Notification reminder",()->beginAlert(false));choice(options,"Ringing alarm",()->beginAlert(true));break;
            case "permission":
                choice(options,"Open settings",this::alertSettings);choice(options,"I've enabled it",()->beginAlert(ringing));break;
            case "time":choice(options,"Choose date & time",()->EntryDialogs.time(this,System.currentTimeMillis()+3600000,at->confirmAlertTime(at)));break;
            case "confirm_alert":choice(options,ringing?"Set alarm":"Set reminder",this::scheduleAlert);choice(options,"Change time",()->ask("time",promptTarget,"When? Type a full time such as tomorrow at 7 am, or use the picker."));break;
        }
        if(!prompt.equals("details")&&!prompt.equals("permission")){
            Ui.gap(conversation,8);LinearLayout response=Ui.row(this);replyInput=Ui.input(this,"Reply here…");replyInput.setContentDescription("Reply to RPM");replyInput.setText(replyDraft);replyInput.setMinHeight(Ui.dp(this,48));replyInput.setMaxLines(2);Ui.padding(replyInput,12,12,12,12);Ui.weighted(response,replyInput);Ui.hgap(response,8);
            response.addView(Ui.iconButton(this,R.drawable.ic_send,"Send reply",()->{String text=replyInput.getText().toString().trim();if(text.isEmpty()){replyInput.setError("Write a reply or tap a choice");return;}replyDraft=text;if(!handleReply(text)){question="I didn't recognize that reply. Tap a choice, or write a new thought in the main box below.";showConversation();}}));conversation.addView(response);
        }
        choice(options,"Not now",()->{prompt="";question="You can keep writing. Nothing else changed.";reply="";showConversation();});
    }
    private final class ReplyFlow extends ViewGroup {
        ReplyFlow(){super(CaptureActivity.this);}
        @Override protected void onMeasure(int ws,int hs){int width=MeasureSpec.getSize(ws),x=0,y=0,rowHeight=0,gap=Ui.dp(getContext(),8);for(int i=0;i<getChildCount();i++){View child=getChildAt(i);child.measure(MeasureSpec.makeMeasureSpec(width,MeasureSpec.AT_MOST),MeasureSpec.makeMeasureSpec(0,MeasureSpec.UNSPECIFIED));int w=child.getMeasuredWidth(),h=child.getMeasuredHeight();if(x>0&&x+w>width){x=0;y+=rowHeight+gap;rowHeight=0;}x+=w+gap;rowHeight=Math.max(rowHeight,h);}setMeasuredDimension(width,y+rowHeight);}
        @Override protected void onLayout(boolean changed,int l,int t,int r,int b){int width=r-l,x=0,y=0,rowHeight=0,gap=Ui.dp(getContext(),8);boolean rtl=getLayoutDirection()==LAYOUT_DIRECTION_RTL;for(int i=0;i<getChildCount();i++){View child=getChildAt(i);int w=child.getMeasuredWidth(),h=child.getMeasuredHeight();if(x>0&&x+w>width){x=0;y+=rowHeight+gap;rowHeight=0;}int left=rtl?width-x-w:x;child.layout(left,y,left+w,y+h);x+=w+gap;rowHeight=Math.max(rowHeight,h);}}
    }
    private String durationQuestion(){return checkin()?"How many minutes did you spend? Tap an option or type a number. This is reported actual time.":"How many minutes should I estimate? Tap an option or type a number.";}
    private void chooseDuration(){ask("duration",-1,durationQuestion());}
    private void setFeeling(boolean isMood,String value){
        try{String selected=value.equals("Not recorded")?null:value;
            if(promptTarget>0){ContentValues v=new ContentValues();if(selected==null)v.putNull(isMood?"mood":"energy");else v.put(isMood?"mood":"energy",selected);store.update(promptTarget,v,"User selected "+(isMood?"mood":"energy"));}
            else{if(isMood)mood=selected;else energy=selected;}
            answered(value,(isMood?"Mood":"Energy")+(promptTarget>0?" updated.":" selected for your next check-in."));refreshChoiceLabels();
        }catch(Exception ex){chatError();}
    }
    private void applyMinutes(Integer n){
        try{if(promptTarget>0){ContentValues v=new ContentValues();if(n==null&&checkin())v.putNull("minutes");else v.put("minutes",n==null?30:n);v.put("duration_source",checkin()?(n==null?"not_reported":"reported_actual"):(n==null?"default_estimate":"chosen_estimate"));store.update(promptTarget,v,"User chose duration in composer");suggestionDismissed=true;}
            else duration=n;
            answered(n==null?"Clear duration":n+" minutes",n==null?(checkin()?"Actual duration is not recorded.":"Using the default 30-minute estimate."):(promptTarget>0?"Saved entry updated: ":"For your next entry: ")+n+(checkin()?" minutes reported.":" minutes estimated."));refreshChoiceLabels();
        }catch(Exception ex){chatError();}
    }
    private void applyPurpose(String value){try{if(promptTarget>0){ContentValues v=new ContentValues();v.put("purpose",value);store.update(promptTarget,v,"Purpose chosen in composer");}else purpose=value;answered(value.isEmpty()?"No purpose":value,promptTarget>0?"Purpose updated.":"Purpose selected for your next entry.");refreshChoiceLabels();}catch(Exception ex){chatError();}}
    private void refreshChoiceLabels(){if(durationButton!=null)durationButton.setText(durationLabel());if(purposeButton!=null){purposeButton.setText(purpose.isEmpty()?"Purpose":"Purpose added");Ui.selectChip(purposeButton,!purpose.isEmpty());}if(moodButton!=null){moodButton.setText(mood==null?"Mood":mood);Ui.selectChip(moodButton,mood!=null);}if(energyButton!=null){energyButton.setText(energy==null?"Energy":energy);Ui.selectChip(energyButton,energy!=null);}}
    private void confirmCorrection(){try{ContentValues v=new ContentValues();v.put("minutes",correctionValue);v.put("duration_source",checkin()?"reported_actual":"chosen_estimate");store.update(promptTarget,v,"Correction confirmed: "+correctionRaw);suggestionDismissed=true;if(input.getText().toString().trim().equals(correctionRaw))input.setText("");answered(correctionRaw,"Updated to "+correctionValue+(checkin()?" minutes reported.":" minutes estimated."));}catch(Exception ex){chatError();}}
    private void chatError(){question="That change didn't save. Your input is still here; please try again.";showConversation();}
    private boolean handleReply(String raw){
        if(prompt.isEmpty()||prompt.equals("details"))return false;
        String value=raw.trim();String lower=value.toLowerCase(java.util.Locale.ROOT);
        if(lower.equals("cancel")||lower.equals("not now")||lower.equals("skip")){answered(value,"Okay. You can keep writing.");return true;}
        if(prompt.equals("mood")||prompt.equals("energy")){
            for(String v:prompt.equals("mood")?MOODS:ENERGIES)if(v.equalsIgnoreCase(value)){boolean m=prompt.equals("mood");setFeeling(m,v);return true;}
            return false;
        }
        if(prompt.equals("duration")){
            Integer n=CaptureParser.correctionMinutes("Actually, "+value.replaceAll("(?i)\\s*(minutes?|mins?)$",""));
            if(n!=null){applyMinutes(n);return true;}
            if(value.matches("[0-9]+(?:\\s*(?i:minutes?|mins?))?")){question="Use a duration from 1 to 1440 minutes, or tap Not now.";showConversation();return true;}return false;
        }
        if(prompt.equals("purpose")){applyPurpose(value);return true;}
        if(prompt.equals("title")){try{ContentValues v=new ContentValues();v.put("title",value);store.update(promptTarget,v,"Title changed in composer; raw retained");answered(value,"Title updated. Original input is still in history.");}catch(Exception ex){chatError();}return true;}
        if(prompt.equals("correction")&&(lower.equals("yes")||lower.equals("update duration"))){confirmCorrection();return true;}
        if(prompt.equals("alert")){if(lower.equals("alarm")||lower.equals("ringing alarm")){beginAlert(true);return true;}if(lower.equals("reminder")||lower.equals("notification reminder")){beginAlert(false);return true;}}
        if(prompt.equals("time")){CaptureParser.Parsed parsed=CaptureParser.parse(value,ZonedDateTime.now());if(parsed.plannedAt!=null){reply=value;confirmAlertTime(parsed.plannedAt);return true;}question="I couldn't read a full future date and time. Use the picker, try tomorrow at 7 am, or tap Not now to write another thought.";showConversation();return true;}
        if(prompt.equals("confirm_alert")&&(lower.equals("yes")||lower.equals("set alarm")||lower.equals("set reminder"))){scheduleAlert();return true;}
        return false;
    }
    private void beginAlert(boolean alarm){
        ringing=alarm;
        if(!Alarms.notificationsAllowed(this)||(ringing&&!Alarms.exactAllowed(this))){ask("permission",promptTarget,"Your entry is saved. Enable "+(!Alarms.notificationsAllowed(this)?"RPM notifications":"Alarms & reminders")+" in Android, then return here to choose a time.");return;}
        ask("time",promptTarget,"When should the "+(ringing?"alarm ring":"notification arrive")+"? Type a full time such as tomorrow at 7 am, or choose below.");
    }
    private void alertSettings(){if(!Alarms.notificationsAllowed(this))EntryDialogs.requestNotifications(this);else if(android.os.Build.VERSION.SDK_INT>=31)startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,android.net.Uri.parse("package:"+getPackageName())));}
    private void confirmAlertTime(long at){if(at<=System.currentTimeMillis()){question="Choose a future time.";showConversation();return;}alertAt=at;JSONObject e=store.get(promptTarget);ask("confirm_alert",promptTarget,e.optString("title")+"\n"+Ui.date(at)+"\n\n"+(ringing?"Ring at your alarm volume. Snooze is 10 minutes; an unanswered alarm stops after 10 minutes.":"Send a notification. Android may delay delivery.")+(ringing&&!Alarms.fullScreenAllowed(this)?" Full-screen alerts are off; use notification controls.":""));}
    private void scheduleAlert(){
        if(alertAt<=System.currentTimeMillis()){ask("time",promptTarget,"That time has passed. Choose a future time.");return;}
        if(!Alarms.notificationsAllowed(this)||(ringing&&!Alarms.exactAllowed(this))){beginAlert(ringing);return;}
        String type=ringing?"alarm":"reminder";
        try{ContentValues v=new ContentValues();v.put(type,alertAt);v.put(type+"_status","scheduled");store.update(promptTarget,v,"User confirmed "+type+" in composer");if(ringing)Alarms.schedule(this,promptTarget,alertAt);else Reminders.schedule(this,promptTarget,alertAt);answered(ringing?"Set alarm":"Set reminder",(ringing?"Alarm set for ":"Notification scheduled for ")+Ui.date(alertAt)+".");}
        catch(Exception ex){if(ringing)Alarms.cancel(this,promptTarget);else Reminders.cancel(this,promptTarget);try{ContentValues v=new ContentValues();v.put(type+"_status","failed");store.update(promptTarget,v,"Alert scheduling failed");}catch(Exception ignored){}question="Your entry is saved, but the alert could not be scheduled. Check permissions and try again.";showSaved();showConversation();}
    }
    private void save(boolean forceNew){
        String raw=input.getText().toString().trim();if(raw.isEmpty()){input.setError("Add a few words first");return;}
        Integer correction=CaptureParser.correctionMinutes(raw);
        if(!forceNew&&correction!=null&&latest>0){
            JSONObject target=store.get(latest);
            correctionRaw=raw;correctionValue=correction;
            ask("correction",latest,"Update “"+target.optString("title")+"” to "+correction+" minutes "+(checkin()?"reported":"estimated")+"? Tap Update duration or reply yes.");return;
        }
        try{
            ContentValues v=new ContentValues();v.put("kind",checkin()?"checkin":"plan");v.put("raw",raw);v.put("title",raw);v.put("created",System.currentTimeMillis());v.put("purpose",purpose);
            CaptureParser.Parsed parsed=CaptureParser.parse(raw,ZonedDateTime.now());
            if(checkin()){
                if(duration!=null)v.put("minutes",duration);else v.putNull("minutes");
                v.put("duration_source",duration==null?"not_reported":"reported_actual");v.put("mood",mood);v.put("energy",energy);
            }else{
                v.put("minutes",duration==null?parsed.minutes:duration);v.put("duration_source",duration!=null||parsed.explicitDuration?"chosen_estimate":"default_estimate");
                if(parsed.plannedAt!=null)v.put("planned",parsed.plannedAt);v.put("interpretation",parsed.notice);
            }
            latest=store.add(v);suggestionDismissed=false;prompt="";reply="";question="";input.setText("");purpose="";duration=null;mood=null;energy=null;draft="";
            getPreferences(0).edit().remove("draft_"+mode).commit();
            render();input.requestFocus();input.announceForAccessibility("Saved locally");
            if("remind".equals(mode))ask("alert",latest,"How should this alert you? Choose a notification or a ringing alarm.");
        }catch(Exception ex){chatError();}
    }
    private void showSaved(){
        saved.removeAllViews();if(latest<1)return;
        JSONObject e=store.get(latest);LinearLayout card=Ui.card(this);Ui.padding(card,12,4,8,12);card.setBackground(Ui.bg(Ui.PALE,16,this));
        LinearLayout top=Ui.row(this);top.addView(Ui.iconView(this,R.drawable.ic_check,Ui.SUCCESS));Ui.hgap(top,8);Ui.weighted(top,Ui.heading(this,"Saved",14));
        top.addView(Ui.iconButton(this,R.drawable.ic_edit,"Edit saved entry",this::editSaved));card.addView(top);
        TextView title=Ui.heading(this,e.optString("title"),16);title.setMaxLines(2);title.setEllipsize(android.text.TextUtils.TruncateAt.END);card.addView(title);Ui.gap(card,6);
        String meta=checkin()?Ui.day(e.optLong("created"))+" · "+Ui.time(e.optLong("created")):e.isNull("planned")?"No time set":Ui.day(e.optLong("planned"))+" · "+Ui.time(e.optLong("planned"));
        if(!e.isNull("minutes"))meta+=" · "+e.optInt("minutes")+(checkin()?" min reported":" min estimate");card.addView(Ui.text(this,meta,12,Ui.MUTED));
        if(!checkin()&&e.optString("duration_source").equals("default_estimate")&&!suggestionDismissed){
            Button review=Ui.textButton(this,"Review 30 min estimate",()->ask("duration",latest,"I used a 30-minute estimate. How long should “"+e.optString("title")+"” take? Tap a reply or type minutes."));card.addView(review);
        }
        if(e.optString("reminder_status").equals("scheduled")){Ui.gap(card,6);card.addView(Ui.text(this,"Reminder · "+Ui.date(e.optLong("reminder")),12,Ui.MUTED));}
        if(e.optString("alarm_status").equals("scheduled")){Ui.gap(card,6);card.addView(Ui.text(this,"Alarm · "+Ui.date(e.optLong("alarm")),12,Ui.MUTED));}
        saved.addView(card);Ui.gap(saved,8);
        if("remind".equals(mode))saved.addView(Ui.textButton(this,"Choose reminder or alarm",()->ask("alert",latest,"How should this alert you? Choose a notification or a ringing alarm.")));
    }
    private void editSaved(){ask("details",latest,"What would you like to change about “"+store.get(latest).optString("title")+"”? ");}
    @Override protected void onSaveInstanceState(Bundle b){super.onSaveInstanceState(b);b.putString("replyDraft",replyInput==null?replyDraft:replyInput.getText().toString());b.putString("prompt",prompt);b.putString("reply",reply);b.putString("question",question);b.putLong("promptTarget",promptTarget);b.putLong("alertAt",alertAt);b.putBoolean("ringing",ringing);b.putString("correctionRaw",correctionRaw);b.putInt("correctionValue",correctionValue);b.putLong("latest",latest);b.putString("draft",input.getText().toString());b.putString("purpose",purpose);b.putString("mood",mood);b.putString("energy",energy);if(duration!=null)b.putInt("duration",duration);b.putBoolean("details",details);b.putBoolean("suggestionDismissed",suggestionDismissed);}
    @Override protected void onPause(){
        super.onPause();if(input==null)return;
        android.content.SharedPreferences.Editor editor=getPreferences(0).edit()
            .putString("draft_"+mode,input.getText().toString()).putString("purpose_"+mode,purpose)
            .putString("mood_"+mode,mood).putString("energy_"+mode,energy);
        if(duration==null)editor.remove("duration_"+mode);else editor.putInt("duration_"+mode,duration);
        editor.commit();
    }
    @Override protected void onDestroy(){store.close();super.onDestroy();}
}
