<script lang="ts">
 import {tick} from "svelte";
 import {catalog,standalone} from "../catalog";
 import {identity} from "../verified";
 import type {Available,Choice} from "../studio";
 let {choice=$bindable(),label}:{choice:Choice,label:string}=$props();
 let panel:HTMLDivElement, trigger:HTMLButtonElement, search:HTMLInputElement;
 let query=$state(""), expanded=$state(""), custom=$state<Choice["provider"]>("ollama"), opened=$state(false);
 const names={ollama:"Ollama",codex_cli:"Codex",open_ai:"Hosted API"};
 const matches=$derived($catalog.filter(m=>m.model.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b)=>Number(b.model.startsWith(query))-Number(a.model.startsWith(query))).slice(0,8));
 async function open(){
   if(panel.matches(":popover-open")){panel.hidePopover();return}
   query="";expanded="";custom=choice.provider;
   const r=trigger.getBoundingClientRect(),width=Math.min(360,innerWidth-16);
   const below=innerHeight-r.bottom,above=r.top,down=below>=Math.min(360,above);
   panel.style.cssText="width:"+width+"px;left:"+Math.max(8,Math.min(r.left,innerWidth-width-8))+"px;max-height:"+Math.max(100,(down?below:above)-12)+"px;"+(down?"top:"+(r.bottom+4):"bottom:"+(innerHeight-r.top+4))+"px";
   panel.showPopover();await tick();search.focus();
 }
 function choose(m:Available,thinking:string){choice={provider:m.provider,model:m.model,endpoint:m.endpoint,thinking};panel.hidePopover();trigger.focus()}
 const typed=$derived({model:query.trim(),provider:custom,endpoint:custom==="open_ai"?localStorage.getItem("studio-endpoint")??undefined:undefined,levels:custom==="codex_cli"?["low","medium","high"]:["off","low","medium","high"]});
</script>
{#snippet row(m:Available,group:string)}
 <button class="entry" aria-expanded={expanded===group+identity(m)} onclick={()=>expanded=expanded===group+identity(m)?"":group+identity(m)}><span>{m.model}</span><small>{names[m.provider]} ›</small></button>
 {#if expanded===group+identity(m)}<div class="efforts" aria-label={m.model+" thinking level"}>{#each m.levels as level}<button aria-label={m.model+" · "+level} onclick={()=>choose(m,level)}>{level}</button>{/each}</div>{/if}
{/snippet}
<button class="model-trigger" bind:this={trigger} onclick={open} aria-label={label+" model and thinking"} aria-expanded={opened}><span>{choice.model||"Select model"}</span><strong>{choice.thinking}</strong> ▾</button>
<div class="model-menu" popover="auto" bind:this={panel} ontoggle={()=>opened=panel.matches(":popover-open")}>
 <input placeholder="Search models or type an ID" aria-label={label+" model search"} bind:this={search} bind:value={query}/>
 {#if query.trim()}<h4>Best matches</h4>{#each matches as m}{@render row(m,"match")}{:else}<small>No catalog matches</small>{/each}{/if}
 {#if query.trim()}<h4>Use custom ID</h4><select aria-label="Custom model provider" bind:value={custom}>{#each Object.entries(names) as [key,name]}<option value={key}>{name}</option>{/each}</select>{@render row(typed,"typed")}{/if}
 <h4>Available models</h4>{#each $catalog as m}{@render row(m,"all")}{:else}<small>No connected models found</small>{/each}
 {#if $standalone.length}<details><summary>Antigravity · standalone CLI ({$standalone.length})</summary>{#each $standalone as model}<div>{model}</div>{/each}</details>{/if}

</div>
<style>.model-trigger{display:inline-flex;align-items:center;gap:.6em;max-width:100%;font-size:14px}.model-trigger span,.entry span{overflow:hidden;text-overflow:ellipsis}.model-trigger strong{font-size:.84em;border-left:1px solid var(--border);padding-left:.6em;text-transform:capitalize}.model-menu{position:fixed;inset:auto;margin:0;padding:12px;overflow:auto;border:1px solid var(--muted);border-radius:10px;color:var(--text);background:var(--panel);box-shadow:0 8px 32px #0005}.model-menu input{width:100%;padding:8px;background:var(--panel-alt);color:var(--text);border:1px solid var(--border);border-radius:6px}.model-menu h4{margin:12px 0 4px;font-size:12px;color:var(--muted)}.entry{display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;margin:2px 0;padding:6px 8px;gap:8px}.entry small{white-space:nowrap}.efforts{display:flex;gap:4px;padding:5px;flex-wrap:wrap}.model-menu details{margin:8px 0;font-size:13px;overflow-wrap:anywhere}</style>