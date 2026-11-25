<script lang="ts">
 import {tick} from "svelte";
 import {catalog,standalone} from "../catalog";
 import {identity} from "../verified";
 import {groupAntigravityModels,type Available,type Choice} from "../studio";
 let {choice=$bindable(),label}:{choice:Choice,label:string}=$props();
 let panel:HTMLDivElement, trigger:HTMLButtonElement, search:HTMLInputElement;
 let query=$state(""), expanded=$state(""), custom=$state<Choice["provider"]>("ollama"), opened=$state(false);
 const names:Record<Choice["provider"],string>={ollama:"Ollama",codex_cli:"Codex",antigravity:"Antigravity",open_ai:"Hosted API",gemini:"Gemini API"};
 const providerOrder:Choice["provider"][]=["codex_cli","antigravity","ollama","open_ai","gemini"];
 const allModels=$derived.by(()=>{
   const hasAgy=$catalog.some(m=>m.provider==="antigravity");
   return hasAgy||!$standalone.length ? $catalog : [...$catalog,...groupAntigravityModels($standalone)];
 });
 const matches=$derived(
   allModels
     .filter(m=>m.model.toLowerCase().includes(query.trim().toLowerCase()))
     .sort((a,b)=>Number(b.model.toLowerCase().startsWith(query.trim().toLowerCase()))-Number(a.model.toLowerCase().startsWith(query.trim().toLowerCase())))
     .slice(0,12)
 );
 const sections=$derived(
   providerOrder
     .map(provider=>({provider,name:names[provider],items:allModels.filter(m=>m.provider===provider)}))
     .filter(s=>s.items.length>0)
 );
 async function open(){
   if(panel.matches(":popover-open")){panel.hidePopover();return}
   query="";expanded=allModels.some(m=>isSameModel(m))?"all"+identity(choice):"";
   custom=choice.provider;
   const r=trigger.getBoundingClientRect(),width=Math.min(380,innerWidth-16);
   const below=innerHeight-r.bottom,above=r.top,down=below>=Math.min(380,above);
   panel.style.cssText="width:"+width+"px;left:"+Math.max(8,Math.min(r.left,innerWidth-width-8))+"px;max-height:"+Math.max(120,(down?below:above)-12)+"px;"+(down?"top:"+(r.bottom+4):"bottom:"+(innerHeight-r.top+4))+"px";
   panel.showPopover();await tick();search.focus();
 }
 function isSameModel(m:Available){
   return m.provider===choice.provider&&m.model===choice.model&&(m.endpoint??"")===(choice.endpoint??"");
 }
 function choose(m:Available,thinking:string){choice={provider:m.provider,model:m.model,endpoint:m.endpoint,thinking};panel.hidePopover();trigger.focus()}
 const typed=$derived({model:query.trim(),provider:custom,endpoint:custom==="open_ai"||custom==="gemini"?localStorage.getItem("studio-endpoint")??undefined:undefined,levels:custom==="codex_cli"?["low","medium","high"]:custom==="antigravity"?["low","medium","high","xhigh"]:["off","low","medium","high"]});
</script>
{#snippet row(m:Available,group:string)}
 {@const idKey=group+identity(m)}
 {@const activeModel=isSameModel(m)}
 <button class="entry" class:current={activeModel} aria-expanded={expanded===idKey} onclick={()=>expanded=expanded===idKey?"":idKey}><span>{m.model}</span><small>{names[m.provider]} ›</small></button>
 {#if expanded===idKey}<div class="efforts" aria-label={m.model+" thinking level"}>{#each m.levels as level}<button class:current={activeModel&&choice.thinking===level} aria-label={m.model+" · "+level} onclick={()=>choose(m,level)}>{level}</button>{/each}</div>{/if}
{/snippet}
<button class="model-trigger" bind:this={trigger} onclick={open} aria-label={label+" model and thinking"} aria-expanded={opened}><span>{choice.model||"Select model"}</span><strong>{choice.thinking}</strong> ▾</button>
<div class="model-menu" popover="auto" bind:this={panel} ontoggle={()=>opened=panel.matches(":popover-open")}>
 <input placeholder="Search models or type an ID" aria-label={label+" model search"} bind:this={search} bind:value={query}/>
 {#if query.trim()}<h4>Best matches</h4>{#each matches as m}{@render row(m,"match")}{:else}<small>No catalog matches</small>{/each}{/if}
 {#if query.trim()}<h4>Use custom ID</h4><select aria-label="Custom model provider" bind:value={custom}>{#each Object.entries(names) as [key,name]}<option value={key}>{name}</option>{/each}</select>{@render row(typed,"typed")}{/if}
 {#each sections as section}
  <h4>{section.name} ({section.items.length})</h4>
  {#each section.items as m}{@render row(m,"all")}{/each}
 {:else}
  <h4>Available models</h4><small>No connected models found</small>
 {/each}
</div>
<style>.model-trigger{display:inline-flex;align-items:center;gap:.6em;max-width:100%;font-size:14px}.model-trigger span,.entry span{overflow:hidden;text-overflow:ellipsis}.model-trigger strong{font-size:.84em;border-left:1px solid var(--border);padding-left:.6em;text-transform:capitalize}.model-menu{position:fixed;inset:auto;margin:0;padding:12px;overflow:auto;border:1px solid var(--muted);border-radius:10px;color:var(--text);background:var(--panel);box-shadow:0 8px 32px #0005}.model-menu input{width:100%;padding:8px;background:var(--panel-alt);color:var(--text);border:1px solid var(--border);border-radius:6px}.model-menu h4{margin:12px 0 4px;font-size:12px;color:var(--muted)}.entry{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;margin:2px 0;padding:6px 8px;gap:8px;border:1px solid transparent;border-radius:6px}.entry small{white-space:nowrap}.efforts{display:flex;gap:5px;padding:4px 4px 8px;flex-wrap:wrap}.efforts button{padding:4px 9px;font-size:12px;border-radius:6px}.current{border-color:var(--text)!important;background:var(--panel-alt)!important;font-weight:600}</style>
