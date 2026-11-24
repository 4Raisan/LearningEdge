<script lang="ts">
 import {onMount} from "svelte";
 import {invokeTauri} from "../lib/tauriApi";
 import type {Available,Choice,Preferences} from "../lib/studio";
 import {catalog,standalone} from "../lib/catalog";
 import {verified} from "../lib/verified";
 import ModelPicker from "../lib/components/ModelPicker.svelte";
 let {settings=$bindable()}:{settings:Preferences}=$props();
 let models=$state(verified()), agy=$state<string[]>([]), busy=$state(""), message=$state(""), setup=$state(false);
 let endpoint=$state(localStorage.getItem("studio-endpoint")??""), key=$state("");
 const roles=[["video","Video processing"],["notes","Note processing"],["knowledge","Knowledge chat"]] as const;
 const cards=["Codex","Antigravity","Local AI & hosted API"];
 function save(next:Available[]){models=next;catalog.set(next);localStorage.setItem("verified-models-v1",JSON.stringify(next))}
 async function discover(id:number){
   busy=cards[id];message="";
   try{
    if(id===1){agy=await invokeTauri<string[]>("agy_models");standalone.set(agy);return}
    const native=await invokeTauri<Available[]>("studio_models");
    if(id===0){save([...models.filter(m=>m.provider!=="codex_cli"),...native.filter(m=>m.provider==="codex_cli")]);return}
    save([...models.filter(m=>m.provider!=="ollama"),...native.filter(m=>m.provider==="ollama")]);
    if(endpoint.trim()){
      const base=endpoint.trim().replace(/\/+$/,"");
      if(key){await invokeTauri("hosted_key",{endpoint:base,key});key=""}
      localStorage.setItem("studio-endpoint",base);
      save(models.filter(m=>m.provider!=="open_ai"));
      const ids=await invokeTauri<string[]>("hosted_models",{endpoint:base});
      save([...models,...ids.map(model=>({provider:"open_ai" as const,model,endpoint:base,levels:["off","low","medium","high"]}))]);
    }
   }catch(e){if(id===1){agy=[];standalone.set([])};message=String(e)}finally{busy=""}
 }
 onMount(async()=>{for(const id of [0,1,2])await discover(id)});
 async function sign(id:number){try{await invokeTauri("studio_connect",{provider:id===0?"codex_cli":"antigravity"})}catch(e){message=String(e)}}
</script>
<section class="workspace providers"><div class="tiles">{#each cards as title,id}
{@const list=id===1?agy:models.filter(m=>id===0?m.provider==="codex_cli":m.provider!=="codex_cli").map(m=>m.model)}
<article class="card"><h3>{title}</h3><p class:connected={list.length>0}>{busy===title?"Checking…":list.length?(id===2?"✓ Available":"✓ Signed in"):"Connection unconfirmed"}</p>
{#if id<2&&!list.length}<button onclick={()=>sign(id)}>Sign in</button>{/if}
{#if id===2}<button onclick={()=>setup=!setup}>API settings</button>{/if}
<button disabled={!!busy} onclick={()=>discover(id)}>Check availability</button>
<select aria-label={title+" available models"}><option>{list.length} models</option>{#each list as name}<option>{name}</option>{/each}</select></article>{/each}</div>
{#if setup}<form class="card setup" onsubmit={e=>{e.preventDefault();discover(2)}}><label>API base URL<input type="url" required bind:value={endpoint} placeholder="https://…/v1"/></label><label>API key<input type="password" bind:value={key} placeholder="Use saved key"/></label><button disabled={!!busy}>Check availability</button></form>{/if}
{#if message}<p role="status">{message}</p>{/if}<h3>Model settings</h3><div class="tiles">{#each roles as [role,label]}<article class="card"><h3>{label}</h3><ModelPicker {label} bind:choice={settings[role]}/></article>{/each}</div></section>
<style>.connected{color:#78dca7!important}.providers .card h3{margin-bottom:12px}.setup{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.setup label{display:grid;font-size:12px}.providers button{margin:2px}</style>