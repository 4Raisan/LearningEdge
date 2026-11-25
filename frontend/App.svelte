<script lang="ts">
 import LectureToVideo from "./pages/LectureToVideo.svelte";
 import Providers from "./pages/Providers.svelte";

 import {preferences} from "./lib/studio";
 const tabs=["Lecture to Video","Providers","Knowledge Graph & Dreaming"] as const;
 let theme=$state(localStorage.getItem("workspace-theme")??"night");
 $effect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem("workspace-theme",theme)});
 let tab=$state<string>(tabs[0]);
 let lecture:ReturnType<typeof LectureToVideo>;
 let settings=$state(preferences());
 $effect(()=>{localStorage.setItem("studio-models",JSON.stringify(settings))});
</script>
<main class="shell"><header class="topbar"><h1>LearningEdge</h1>
<nav aria-label="Workspace">{#each tabs as name}<button class:active={tab===name} aria-current={tab===name?"page":undefined} onclick={()=>tab=name}>{name}</button>{/each}</nav><div class="themes" aria-label="Workspace theme">{#if tab===tabs[0]}<button class="layout-reset" onclick={()=>lecture.resetLayout()}>Reset layout</button>{/if}{#each [["light","☀"],["night","☾"],["forest","❧"]] as [name,icon]}<button title={name+" theme"} aria-label={name+" theme"} aria-pressed={theme===name} onclick={()=>theme=name}>{#if name==="forest"}<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 3C12 3 4 6 4 13a7 7 0 0 0 7 7c7 0 10-8 9-17Z"/><path d="m3 22 12-13"/></svg>{:else}{icon}{/if}</button>{/each}</div></header>
<div hidden={tab!==tabs[0]}><LectureToVideo bind:this={lecture} bind:settings/></div>
<div hidden={tab!==tabs[1]}><Providers bind:settings/></div>{#if tab===tabs[2]}{#await import("./pages/Knowledge.svelte")}<p>Loading graph…</p>{:then module}<module.default bind:choice={settings.knowledge}/>{/await}{/if}
</main>
<style>.shell{max-width:min(2200px,100%);width:100%;margin:auto;padding:clamp(8px,1.3vw,24px)}.topbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px clamp(10px,1.8vw,24px);border-bottom:1px solid #272727;padding-bottom:10px;margin-bottom:14px}h1{font-size:clamp(18px,1.5vw,23px);margin:0}nav{display:flex;flex-wrap:wrap;gap:6px}nav button{font-size:clamp(12px,1vw,14px)}button.active{background:white;color:black}.themes{display:flex;align-items:center;gap:4px;margin-left:auto;flex-wrap:wrap}.themes button{padding:3px 9px;font-size:18px}.themes [aria-pressed=true]{border-color:var(--text)}.themes .layout-reset{font-size:13px;padding:6px 10px;margin-right:6px;white-space:nowrap}@media(max-width:780px){.topbar{gap:8px}.themes{margin-left:0;width:100%;justify-content:flex-end}}@media(max-height:740px){.topbar{padding-bottom:8px;margin-bottom:8px}}</style>
