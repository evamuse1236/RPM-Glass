/** Only facts that can change the rendered Capture belong in this comparison. */
export function captureRenderKey(state){return JSON.stringify({version:state?.version,aiEnabled:state?.aiEnabled,captureMode:state?.captureMode,intent:state?.intent,delivery:state?.phone?.delivery});}
/** Resume/configuration callbacks may overlap. Share one load and its result. */
export function coalesceRefresh(run){let pending=null;return()=>{if(pending)return pending;pending=Promise.resolve().then(run).finally(()=>pending=null);return pending;};}
