package com.rpm.prototype;

import android.app.*;
import android.content.*;
import android.os.Bundle;
import android.widget.*;
import org.json.JSONObject;
import java.util.*;

public final class ResultActivity extends Activity {
    private Store store;private long id;private boolean editing;private EditText result,purpose,domain;private String draftResult,draftPurpose,draftDomain;
    @Override public void onCreate(Bundle b){super.onCreate(b);Ui.theme(this);store=new Store(this);id=getIntent().getLongExtra("project",-1);editing=id<0;if(b!=null){id=b.getLong("id",id);editing=b.getBoolean("editing",editing);draftResult=b.getString("result");draftPurpose=b.getString("purpose");draftDomain=b.getString("domain");}render();}
    @Override protected void onResume(){super.onResume();if(!editing)render();}
    private JSONObject project(){for(JSONObject p:store.projects())if(p.optLong("_id")==id)return p;return new JSONObject();}
    private void render(){Ui.theme(this);JSONObject p=project();LinearLayout root=Ui.column(this);root.setBackgroundColor(Ui.PAPER);LinearLayout toolbar=Ui.toolbar(this,editing?(id<0?"New result":"Edit result"):"Result",this::finish);if(!editing)toolbar.addView(Ui.iconButton(this,R.drawable.ic_edit,"Edit result",()->{editing=true;render();}));root.addView(toolbar);ScrollView scroll=new ScrollView(this);scroll.setVerticalScrollBarEnabled(false);LinearLayout body=Ui.column(this);Ui.padding(body,20,24,20,24);scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        if(editing){result=Ui.input(this,"What would you like to change?");result.setMinLines(2);result.setText(draftResult==null?p.optString("result"):draftResult);Ui.field(body,"Desired result",result);purpose=Ui.input(this,"Why does this matter to you?");purpose.setMinLines(2);purpose.setText(draftPurpose==null?p.optString("purpose"):draftPurpose);Ui.field(body,"Purpose · optional",purpose);domain=Ui.input(this,"For example, Health or Relationships");domain.setSingleLine(true);domain.setText(draftDomain==null?p.optString("domain"):draftDomain);Ui.field(body,"Life area · optional",domain);body.addView(Ui.text(this,"You can link actions later. Start with what matters.",14,Ui.MUTED));LinearLayout dock=Ui.column(this);Ui.padding(dock,20,8,20,12);dock.addView(Ui.button(this,"Save result",true,this::save));root.addView(dock);}
        else{if(!p.optString("domain").isEmpty()){body.addView(Ui.text(this,p.optString("domain"),14,Ui.ACCENT));Ui.gap(body,12);}TextView title=Ui.heading(this,p.optString("result"),28);title.setTextIsSelectable(true);body.addView(title);if(!p.optString("purpose").isEmpty()){Ui.section(body,"Why it matters");body.addView(Ui.text(this,p.optString("purpose"),16,Ui.NAVY));}List<JSONObject> entries=store.query("SELECT * FROM entries WHERE project=? ORDER BY done,created DESC",new String[]{""+id});int actions=0,done=0;for(JSONObject e:entries)if(e.optString("kind").equals("plan")){actions++;done+=e.optInt("done");}Ui.section(body,"Linked actions");body.addView(Ui.text(this,actions==0?"No actions linked yet":done+" of "+actions+" marked done",14,Ui.MUTED));Ui.gap(body,16);if(entries.isEmpty())body.addView(Ui.text(this,"Open any entry and choose this result to link it.",16,Ui.MUTED));for(JSONObject e:entries){body.addView(MainActivity.entryRow(this,e,()->startActivity(new Intent(this,EntryActivity.class).putExtra("entry",e.optLong("_id")))));Ui.gap(body,8);}}
        setContentView(root);Ui.insets(this,root);
    }
    private void save(){String title=result.getText().toString().trim();if(title.isEmpty()){result.setError("Add a result");result.requestFocus();return;}try{ContentValues v=new ContentValues();v.put("result",title);v.put("purpose",purpose.getText().toString().trim());v.put("domain",domain.getText().toString().trim());if(id<0){id=store.saveProject(null,v);}else store.saveProject(id,v);editing=false;draftResult=draftPurpose=draftDomain=null;((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(result.getWindowToken(),0);render();}catch(Exception ex){EntryDialogs.error(this,ex);}}
    @Override protected void onSaveInstanceState(Bundle b){super.onSaveInstanceState(b);b.putLong("id",id);b.putBoolean("editing",editing);if(editing&&result!=null){b.putString("result",result.getText().toString());b.putString("purpose",purpose.getText().toString());b.putString("domain",domain.getText().toString());}}
    @Override protected void onDestroy(){store.close();super.onDestroy();}
}
