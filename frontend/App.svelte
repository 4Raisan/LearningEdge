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
<style>.shell{max-width:1680px;margin:auto;padding:clamp(12px,2vw,32px)}.topbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px 32px;border-bottom:1px solid #272727;padding-bottom:16px;margin-bottom:20px}h1{font-size:23px;margin:0}nav{display:flex;flex-wrap:wrap;gap:6px}nav button{font-size:14px}button.active{background:white;color:black}.themes{display:flex;gap:4px;margin-left:auto}.themes button{padding:3px 9px;font-size:18px}.themes [aria-pressed=true]{border-color:var(--text)}.themes .layout-reset{font-size:13px;margin-right:4px}</style>
