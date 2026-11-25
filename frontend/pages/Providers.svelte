<script lang="ts">
 import {onMount} from "svelte";
 import {invokeTauri} from "../lib/tauriApi";
 import {groupAntigravityModels,normalizeChoice,type Available,type Choice,type Preferences} from "../lib/studio";
 import {catalog,standalone} from "../lib/catalog";
 import {verified} from "../lib/verified";
 import ModelPicker from "../lib/components/ModelPicker.svelte";

 let {settings=$bindable()}:{settings:Preferences}=$props();

 function loadHostedModels():string[]{
   try{
     const raw=JSON.parse(localStorage.getItem("studio-hosted-models")??"[]");
     return Array.isArray(raw)?raw.filter((s):s is string=>typeof s==="string"&&!!s.trim()):[];
   }catch{return []}
 }

 let models=$state(verified().filter(m=>m.provider!=="antigravity").concat(groupAntigravityModels(verified().filter(m=>m.provider==="antigravity").map(m=>m.model))));
 let busy=$state(""), message=$state(""), setup=$state(false);
 let endpoint=$state(localStorage.getItem("studio-endpoint")??""), key=$state("");
 let hostedModelIds=$state<string[]>(loadHostedModels()), modelIdInput=$state("");

 const roles=[["video","Video processing"],["notes","Note processing"],["knowledge","Knowledge chat"]] as const;
 const cards=["Codex","Antigravity","Local AI & hosted API"];

 function save(next:Available[]){
   models=next;
   catalog.set(next);
   localStorage.setItem("verified-models-v1",JSON.stringify(next));
 }

 function saveHostedIds(ids:string[]){
   hostedModelIds=ids;
   localStorage.setItem("studio-hosted-models",JSON.stringify(ids));
 }

 function commitModelInput(){
   const incoming=modelIdInput.split(",").map(s=>s.trim()).filter(Boolean);
   if(!incoming.length) return;
   const next=Array.from(new Set([...hostedModelIds,...incoming]));
   saveHostedIds(next);
   modelIdInput="";
 }

 function removeHostedModel(id:string){
   saveHostedIds(hostedModelIds.filter(x=>x!==id));
 }

 function hostedProviderFor(base:string):"open_ai"|"gemini"{
   return base.includes("generativelanguage.googleapis.com")&&!base.includes("/openai")?"gemini":"open_ai";
 }

 async function discover(id:number,verifyHosted=false){
   busy=cards[id];
   if(verifyHosted||id!==2) message="";
   try{
    if(id===1){
      const rawAgy=await invokeTauri<string[]>("agy_models");
      standalone.set(rawAgy);
      const grouped=groupAntigravityModels(rawAgy);
      save([...models.filter(m=>m.provider!=="antigravity"),...grouped]);
      const normVideo=normalizeChoice(settings.video);
      const normNotes=normalizeChoice(settings.notes);
      if(normVideo.model!==settings.video.model||normNotes.model!==settings.notes.model){
        settings={...settings,video:normVideo,notes:normNotes};
      }
      return;
    }
    const native=await invokeTauri<Available[]>("studio_models");
    if(id===0){
      save([...models.filter(m=>m.provider!=="codex_cli"),...native.filter(m=>m.provider==="codex_cli")]);
      return;
    }
    commitModelInput();
    const baseWithoutHosted=models.filter(m=>m.provider!=="ollama"&&m.provider!=="open_ai"&&m.provider!=="gemini");
    const ollamaItems=native.filter(m=>m.provider==="ollama");
    if(!endpoint.trim()){
      save([...baseWithoutHosted,...ollamaItems]);
      return;
    }
    const base=endpoint.trim().replace(/\/+$/,"");
    if(verifyHosted&&hostedModelIds.length===0){
      message="Add at least one Model ID for your hosted API.";
      save([...baseWithoutHosted,...ollamaItems]);
      return;
    }
    if(key){
      await invokeTauri("hosted_key",{endpoint:base,key});
      key="";
    }
    localStorage.setItem("studio-endpoint",base);
    const hostedProvider=hostedProviderFor(base);
    let discoveredIds:string[]=[];
    try{
      discoveredIds=await invokeTauri<string[]>("hosted_models",{endpoint:base});
    }catch{
      /* Many custom or Gemini endpoints omit /models; allow explicit model IDs */
    }
    const mergedIds=Array.from(new Set([...hostedModelIds,...discoveredIds]));
    if(verifyHosted&&mergedIds.length===0){
      throw new Error("Add at least one Model ID to verify this endpoint.");
    }
    if(verifyHosted&&mergedIds.length>0){
      await invokeTauri("studio_verify",{
        choice:{provider:hostedProvider,model:mergedIds[0],endpoint:base,thinking:"off"}
      });
    }
    const hostedEntries:Available[]=mergedIds.map(model=>({
      provider:hostedProvider,
      model,
      endpoint:base,
      levels:["off","low","medium","high"],
    }));
    save([...baseWithoutHosted,...ollamaItems,...hostedEntries]);
    if(verifyHosted&&hostedEntries.length>0){
      message=`Connected ${hostedEntries.length} hosted model(s) at ${base}.`;
    }
   }catch(e){
    if(id===1){
      standalone.set([]);
      save(models.filter(m=>m.provider!=="antigravity"));
    }
    message=String(e);
   }finally{busy=""}
 }

 function cardModels(id:number):Available[]{
   if(id===0) return models.filter(m=>m.provider==="codex_cli");
   if(id===1) return models.filter(m=>m.provider==="antigravity");
   return models.filter(m=>m.provider==="ollama"||m.provider==="open_ai"||m.provider==="gemini");
 }

 function cardOwnsActive(id:number):boolean{
   const p=settings.video.provider;
   if(id===0) return p==="codex_cli";
   if(id===1) return p==="antigravity";
   return p==="ollama"||p==="open_ai"||p==="gemini";
 }

 function selectedCardEntry(id:number,list:Available[]):Available|undefined{
   if(!cardOwnsActive(id)) return undefined;
   return list.find(m=>m.model===settings.video.model&&(m.endpoint??"")===(settings.video.endpoint??""))
     ?? list.find(m=>m.model===settings.video.model);
 }

 function applyCardModel(id:number,modelName:string){
   if(!modelName) return;
   const list=cardModels(id);
   const entry=list.find(m=>m.model===modelName);
   if(!entry) return;
   const preferred=entry.levels.includes(settings.video.thinking)
     ? settings.video.thinking
     : (entry.levels.includes("low")?"low":entry.levels.includes("medium")?"medium":entry.levels[0]??"off");
   const next:Choice={provider:entry.provider,model:entry.model,endpoint:entry.endpoint,thinking:preferred};
   settings={...settings,video:{...next},notes:{...next}};
   message=`Selected ${next.model} (${next.thinking}) for notes & video.`;
 }

 function applyCardThinking(id:number,thinking:string){
   const list=cardModels(id);
   const active=selectedCardEntry(id,list);
   if(!active||!thinking) return;
   const next:Choice={provider:active.provider,model:active.model,endpoint:active.endpoint,thinking};
   settings={...settings,video:{...next},notes:{...next}};
   message=`Updated ${next.model} thinking level to ${thinking}.`;
 }

 onMount(async()=>{for(const id of [0,1,2])await discover(id,false)});
 async function sign(id:number){try{await invokeTauri("studio_connect",{provider:id===0?"codex_cli":"antigravity"})}catch(e){message=String(e)}}
</script>

<section class="workspace providers">
 <div class="tiles">
  {#each cards as title,id}
   {@const list=cardModels(id)}
   {@const activeEntry=selectedCardEntry(id,list)}
   <article class="card">
    <h3>{title}</h3>
    <p class:connected={list.length>0}>{busy===title?"Checking…":list.length?(id===2?"✓ Available":"✓ Signed in"):"Connection unconfirmed"}</p>
    {#if id<2&&!list.length}<button onclick={()=>sign(id)}>Sign in</button>{/if}
    {#if id===2}<button onclick={()=>setup=!setup}>API settings</button>{/if}
    <button disabled={!!busy} onclick={()=>discover(id,true)}>Check availability</button>
    <div class="card-selects">
     <select aria-label={title+" available models"} value={activeEntry?.model??""} onchange={e=>applyCardModel(id,(e.currentTarget as HTMLSelectElement).value)}>
      <option value="">{list.length} models</option>
      {#each list as entry}<option value={entry.model}>{entry.model}</option>{/each}
     </select>
     {#if activeEntry}
      <select aria-label={title+" thinking level"} value={settings.video.thinking} onchange={e=>applyCardThinking(id,(e.currentTarget as HTMLSelectElement).value)}>
       {#each activeEntry.levels as lvl}<option value={lvl}>{lvl}</option>{/each}
      </select>
     {/if}
    </div>
   </article>
  {/each}
 </div>

 {#if setup}
  <form class="card setup" onsubmit={e=>{e.preventDefault();discover(2,true)}}>
   <div class="setup-row">
    <label>API base URL<input type="url" required bind:value={endpoint} placeholder="https://…/v1"/></label>
    <label>API key<input type="password" bind:value={key} placeholder="Use saved key"/></label>
    <label class="model-id-field">Add Model ID<div class="model-id-input"><input bind:value={modelIdInput} placeholder="Model ID (e.g. gpt-4.1-mini)" onkeydown={e=>{if(e.key==="Enter"){e.preventDefault();commitModelInput()}}}/><button type="button" onclick={commitModelInput}>+ Add model</button></div></label>
    <button disabled={!!busy}>Save & check</button>
   </div>
   <div class="hosted-chips">
    {#each hostedModelIds as id}
     <span class="chip"><span>{id}</span><button type="button" aria-label={"Remove "+id} onclick={()=>removeHostedModel(id)}>×</button></span>
    {:else}
     <small class="warn-hint">Add at least one Model ID required for this hosted API endpoint.</small>
    {/each}
   </div>
  </form>
 {/if}

 {#if message}<p role="status">{message}</p>{/if}
 <h3>Model settings</h3>
 <div class="tiles">
  {#each roles as [role,label]}
   <article class="card"><h3>{label}</h3><ModelPicker {label} bind:choice={settings[role]}/></article>
  {/each}
 </div>
</section>

<style>
 .connected{color:#78dca7!important}
 .providers{width:100%;min-width:0}
 .providers .card{min-width:0}
 .providers .card h3{margin-bottom:12px}
 .card-selects{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center}
 .card-selects select{min-width:0;max-width:100%}
 .setup{display:flex;flex-direction:column;gap:10px}
 .setup-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
 .setup label{display:grid;font-size:12px;gap:4px;flex:1 1 200px;min-width:0}
 .setup label input{width:100%;min-width:0}
 .model-id-input{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
 .model-id-input input{flex:1 1 160px;min-width:0}
 @media(max-width:640px){.setup-row{align-items:stretch}.card-selects select{flex:1 1 100%}}
 .hosted-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
 .chip{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:var(--panel-alt);border:1px solid var(--border);font-size:12px}
 .chip button{padding:0 4px;margin:0;border:none;background:transparent;font-size:14px;line-height:1}
 .warn-hint{color:var(--muted)}
 .providers button{margin:2px}
</style>
