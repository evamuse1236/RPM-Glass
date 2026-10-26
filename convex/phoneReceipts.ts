import type { PlannerCtx } from "./plannerAuth";
import type { Doc, Id } from "./_generated/dataModel";

type Receipt={seq:number;part:number;results:{key:string;rev:number;value:any}[]};
export async function readReceipt(ctx:PlannerCtx,receipt:Doc<"phoneSync">["receipts"][number]):Promise<Receipt> {
  const results=[];
  for(const id of receipt.pages) {
    const page=await ctx.db.get(id);
    if(!page)throw new Error("Missing phone push receipt");
    results.push(...page.rows);
  }
  return {seq:receipt.seq,part:receipt.part,results};
}
export async function saveReceipt(ctx:PlannerCtx,account:Id<"accounts">,receipt:Receipt) {
  const pages:Id<"phoneReceiptPages">[]=[], encoder=new TextEncoder();
  let rows:Receipt["results"]=[], bytes=0;
  for(const row of receipt.results) {
    const size=encoder.encode(JSON.stringify(row)).length;
    if(bytes+size>500000 && rows.length) {
      pages.push(await ctx.db.insert("phoneReceiptPages",{account,rows}));rows=[];bytes=0;
    }
    rows.push(row);bytes+=size;
  }
  if(rows.length)pages.push(await ctx.db.insert("phoneReceiptPages",{account,rows}));
  return {seq:receipt.seq,part:receipt.part,pages};
}
export async function forgetReceipts(ctx:PlannerCtx,receipts:Doc<"phoneSync">["receipts"]) {
  for(const receipt of receipts)for(const id of receipt.pages)await ctx.db.delete(id);
}
