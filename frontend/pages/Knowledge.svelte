<script lang="ts">
 import {onMount,tick} from "svelte";
 const paneNames={graph:"Concept map",note:"Lecture note",chat:"Knowledge chat",dream:"Dreaming"};
 type Pane=keyof typeof paneNames;
 const paneKeys=Object.keys(paneNames) as Pane[];
 const defaults={graph:true,note:false,chat:true,dream:true};
 let panes=$state({...defaults});
 for(const pane of paneKeys){if(pane!=="note")panes[pane]=localStorage.getItem("show-pane-"+pane)!=="false"}
 const upper=$derived(panes.graph||panes.note), lower=$derived(panes.chat||panes.dream);
 async function setPane(pane:Pane,visible:boolean){
   panes[pane]=visible;
   if(pane!=="note")localStorage.setItem("show-pane-"+pane,String(visible));
   if(!visible&&full===pane)full="";
   await tick();
   if(panes.graph&&host?.clientWidth){if(!cy)draw();fit()}
 }
 function resetLayout(){for(const key of paneKeys)setPane(key,defaults[key]);tick().then(fit)}
 let latest=$state(localStorage.getItem("dream-last-check")??"");
 import cytoscape from "cytoscape";
 import {invokeTauri,isTauriRuntime,type KnowledgeGraphSnapshot} from "../lib/tauriApi";
 import type {Choice} from "../lib/studio";
 import {verified} from "../lib/verified";
 import ModelPicker from "../lib/components/ModelPicker.svelte";
 let {choice=$bindable()}:{choice:Choice}=$props();
 type Thread={id:string,concept:string,title:string,messages:{role:"user"|"assistant",text:string}[]};
 function history():Thread[]{try{return JSON.parse(localStorage.getItem("knowledge-threads")??"[]")}catch{return []}}
 let threads=$state(history()),thread=$state(""),historyOpen=$state(false),full=$state(""),docs=$state<{title:string,path:string,body:string}[]>([]),docIndex=$state(0);
 let data=$state<KnowledgeGraphSnapshot>({concepts:[],edges:[],dream_suggestions:[]});
 let host:HTMLDivElement,log:HTMLDivElement,cy:cytoscape.Core|undefined;
 let selected=$state(""),search=$state(""),question=$state(""),status=$state(""),busy=$state(false),showDreams=$state(false);
 const node=$derived(data.concepts.find(n=>n.id===selected));
 const matches=$derived(search.trim()?data.concepts.filter(n=>(n.label+" "+n.summary).toLowerCase().includes(search.trim().toLowerCase())).slice(0,8):[]);
 const active=$derived(threads.find(t=>t.id===thread));
 const documentText=$derived(docs[docIndex]?.body??(node?"# "+node.label+"\n\n"+node.summary:"Select a node to read its note."));
 $effect(()=>{localStorage.setItem("knowledge-threads",JSON.stringify(threads))});
 $effect(()=>{const id=selected;let live=true;docs=[];docIndex=0;if(id&&panes.note)invokeTauri<typeof docs>("concept_markdown",{conceptId:id}).then(v=>{if(live)docs=v}).catch(e=>{if(live)status=String(e)});return()=>{live=false}});
 function focus(id:string,openNote=true){if(openNote){if(full==="graph")full="";setPane("note",true)}if(selected!==id){thread="";question=""}selected=id;search="";const n=cy?.getElementById(id);if(n?.length){cy?.elements().unselect();n.select();cy?.fit(n.closedNeighborhood(),45)}}
 function fit(){cy?.resize();cy?.fit(undefined,45)}
 async function expand(name:string){full=full===name?"":name;await tick();fit()}
 function draw(){
  cy?.destroy();cy=undefined;if(!panes.graph||!host?.clientWidth)return;cy=cytoscape({container:host,elements:[...data.concepts.map(n=>({data:{id:n.id,label:n.label}})),...data.edges.map(e=>({data:{id:e.id,source:e.from_concept_id,target:e.to_concept_id}}))],
    layout:{name:"cose",animate:false,padding:50},minZoom:.15,maxZoom:1.45,
    style:[{selector:"node",style:{"shape":"round-rectangle","width":"label","height":23,padding:"8px",label:"data(label)","text-valign":"center","text-wrap":"ellipsis","text-max-width":"150px","font-size":12,color:"#ecf1f5","background-color":"#222b34","border-color":"#526272","border-width":1}},
    {selector:"edge",style:{width:1.6,"line-color":"#52616c","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-color":"#52616c"}},
    {selector:"node:selected",style:{"background-color":"#b7d4ca","border-color":"#cbecdd",color:"#10251d"}}]});
  cy.on("tap","node",e=>focus(e.target.id()));cy.getElementById(selected).select()
 }
 async function refresh(){data=await invokeTauri<KnowledgeGraphSnapshot>("get_knowledge_graph");if(!node)selected=data.concepts[0]?.id??"";draw()}
 async function dream(){busy=true;try{await invokeTauri("run_dreaming");await refresh();latest=new Date().toLocaleString();localStorage.setItem("dream-last-check",latest);showDreams=true}catch(e){status=String(e)}finally{busy=false}}
 async function review(id:string,accept:boolean){try{await invokeTauri("review_dream_suggestion",{suggestionId:id,accept});await refresh()}catch(e){status=String(e)}}
 async function ask(){
  const q=question.trim(),id=selected;if(!q||!id||busy)return;
  if(!active){thread=crypto.randomUUID();threads.unshift({id:thread,concept:id,title:q,messages:[]})}
  const target=threads.find(t=>t.id===thread)!;
  const prior=target.messages.slice(-8).map(m=>m.role+": "+m.text);
  target.messages.push({role:"user",text:q});question="";busy=true;status="";
  try{const text=await invokeTauri<string>("graph_chat",{choice,conceptId:id,question:q,history:prior});target.messages.push({role:"assistant",text})}catch(e){status=String(e)}finally{busy=false;await tick();if(log)log.scrollTop=log.scrollHeight}
 }
 onMount(()=>{let active=true;if(isTauriRuntime())invokeTauri<KnowledgeGraphSnapshot>("get_knowledge_graph").then(g=>{if(active){data=g;selected=g.concepts[0]?.id??"";draw()}}).catch(e=>status=String(e));const obs=new ResizeObserver(()=>{if(cy)cy.resize();else if(active&&panes.graph&&host.clientWidth&&data.concepts.length)draw()});obs.observe(host);return()=>{active=false;obs.disconnect();cy?.destroy()}});
</script>
<svelte:window onkeydown={e=>{if(e.key==="Escape"){full="";historyOpen=false;search="";showDreams=false;tick().then(fit)}}}/>
<section class="knowledge singleRow"><header class="kbhead"><div class="pane-switches" role="group" aria-label="Visible panes">{#each paneKeys as pane}<label><input type="checkbox" checked={panes[pane]} onchange={e=>setPane(pane,e.currentTarget.checked)}/>{paneNames[pane]}</label>{/each}</div><div class="searchtools"><button onclick={resetLayout}>Reset layout</button>
<div class="find"><input placeholder="Find a concept…" aria-label="Find a concept" bind:value={search} onkeydown={e=>{if(e.key==="Enter"&&matches[0])focus(matches[0].id)}}/>
{#if search}<div class="menu">{#each matches as n}<button onclick={()=>focus(n.id)}>{n.label}</button>{:else}<span>No matching concepts</span>{/each}</div>{/if}</div>
<button title="Chat history" aria-label="Chat history" onclick={()=>historyOpen=!historyOpen}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 4H4v14h4v3l5-3h7Z"/><path d="M8 9h8m-8 4h5"/></svg></button>
{#if historyOpen}<div class="history menu"><button onclick={()=>{thread="";question="";setPane("chat",true);historyOpen=false}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 4H4v14h4v3l5-3h7Z"/><path d="M9 11h6m-3-3v6"/></svg> New chat</button>{#each threads as t}<button onclick={()=>{focus(t.concept,false);setPane("chat",true);thread=t.id;historyOpen=false}}>{t.title}</button>{:else}<span>No saved chats</span>{/each}</div>{/if}</div></header>
<div class="dock-board" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;min-height:0"><section class:expanded={full==="graph"} class="atlas" hidden={!panes.graph}><div class="panelhead"><strong>Concept map</strong><button aria-label={full==="graph"?"Restore":"Expand graph"} title={full==="graph"?"Restore":"Expand graph"} onclick={()=>expand("graph")}>{full==="graph"?"⤡":"⛶"}</button><button class="pane-close" aria-label="Close Concept map" title="Close Concept map" onclick={()=>setPane("graph",false)}>×</button></div>
<div class="map" bind:this={host}></div>{#if !data.concepts.length}<p class="empty">Add a lecture to your graph to explore its concepts.</p>{/if}
<footer><button title="Fit graph" aria-label="Fit graph" onclick={fit}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="8" width="10" height="8" rx="1"/></svg></button></footer>
</section>
<section class:expanded={full==="note"} class="reader" hidden={!panes.note}><div class="panelhead"><strong>{docs.length?"Lecture note":"Concept note"}</strong>{#if docs.length}<button onclick={()=>invokeTauri("open_concept_note",{conceptId:selected,index:docIndex}).catch(e=>status=String(e))}>Open .md</button>{/if}<button aria-label={full==="note"?"Restore":"Expand note"} title={full==="note"?"Restore":"Expand note"} onclick={()=>expand("note")}>{full==="note"?"⤡":"⛶"}</button><button class="pane-close" aria-label="Close Lecture note" title="Close Lecture note" onclick={()=>setPane("note",false)}>×</button></div>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard scrolling for the note reader) -->
<div class="paper" tabindex="0" role="region" aria-label="Markdown note">{#if docs.length>1}<select aria-label="Lecture note" bind:value={docIndex}>{#each docs as d,i}<option value={i}>{d.title}.md</option>{/each}</select>{/if}
{#each documentText.split("\n") as line}{#if line.startsWith("## ")}<h3>{line.slice(3)}</h3>{:else if line.startsWith("# ")}<h2>{line.slice(2)}</h2>{:else if line.trim()}<p>{line}</p>{/if}{/each}
{#if node}<details><summary>Sources and connections</summary>{#each node.links as l}<p>{l.source_refs.join(", ")}</p>{/each}{#each data.edges.filter(e=>e.from_concept_id===selected||e.to_concept_id===selected) as e}{@const other=e.from_concept_id===selected?e.to_concept_id:e.from_concept_id}<button onclick={()=>focus(other)}>{data.concepts.find(n=>n.id===other)?.label??other}</button>{/each}</details>{/if}</div></section>
<section class="chat" hidden={!panes.chat}><div class="panelhead"><strong>Knowledge chat</strong><ModelPicker label="Chat" bind:choice/><button class="pane-close" aria-label="Close Knowledge chat" title="Close Knowledge chat" onclick={()=>setPane("chat",false)}>×</button></div>
<div class="messages" bind:this={log} aria-live="polite">{#each active?.messages??[] as m}<p class:mine={m.role==="user"}>{m.text}</p>{:else}<small>{node?"Ask about "+node.label:"Select a concept to start chatting."}</small>{/each}{#if busy}<small>Working…</small>{/if}{#if status}<p role="status">{status}</p>{/if}</div>
<form onsubmit={e=>{e.preventDefault();ask()}}><input placeholder="Message about this concept…" aria-label="Knowledge message" bind:value={question}/><button disabled={busy||!node||!question.trim()}>Send</button></form></section><aside class="dream-card card" hidden={!panes.dream}><header class="dream-title"><span aria-hidden="true">✧</span><strong>Dreaming</strong><button class="pane-close" aria-label="Close Dreaming" title="Close Dreaming" onclick={()=>setPane("dream",false)}>×</button></header><p>Explore links between your {data.concepts.length} saved concepts.</p><small>{latest?"Last checked "+latest:"No checks yet"}</small><button disabled={busy||!node} onclick={dream}>✧ Check graph</button><button onclick={()=>showDreams=!showDreams}>{data.dream_suggestions.filter(d=>d.status==="pending").length} pending</button>{#if showDreams}<div class="dreams menu"><button onclick={()=>showDreams=false}>Close suggestions</button>{#each data.dream_suggestions.filter(d=>d.status==="pending") as d}<p>{d.title}</p><small>{d.rationale}</small><button onclick={()=>review(d.id,true)}>Accept</button><button onclick={()=>review(d.id,false)}>Dismiss</button>{:else}<p>No pending suggestions.</p>{/each}</div>{/if}</aside>
{#if !upper&&!lower}<p>Choose a pane above to open it.</p>{/if}</div></section>
<style>
.knowledge{flex:1;min-height:0;display:grid;grid-template-rows:auto minmax(0,1.3fr) minmax(0,1fr);gap:10px}.kbhead,.searchtools,.panelhead,footer,form{display:flex;align-items:center;justify-content:space-between;gap:8px}.searchtools,.find{position:relative}.find input{width:clamp(120px,17vw,280px)}.menu{position:absolute;z-index:5;top:100%;right:0;background:#171c20;border:1px solid #414c54;padding:7px;border-radius:8px;min-width:170px;max-height:32vh;overflow:auto}.menu button{display:block;width:100%;text-align:left}.spread{min-height:0;display:grid;grid-template-columns:1.15fr 1fr;gap:10px}.atlas,.reader,.chat{min-height:0;min-width:0;border:1px solid #30383c;border-radius:10px;display:flex;flex-direction:column;overflow:hidden;background:#101315}.atlas{position:relative;background-color:#10151a;background-image:radial-gradient(#374047 1px,transparent 1px);background-size:19px 19px}.panelhead,footer,form{padding:7px 12px}.panelhead{border-bottom:1px solid #2b3035;background:#15191b}.map,.paper,.messages{flex:1;min-height:0}.paper,.messages{overflow:auto;padding:12px 18px}.paper{background:#191b1b;color:#e1dfd7;line-height:1.6}.paper h2,.paper h3{font-family:Georgia,serif}.empty{position:absolute;top:40%;align-self:center;font-size:13px;pointer-events:none}.expanded{position:fixed;inset:8px;z-index:20}.dreams{top:44px;bottom:45px;max-height:none}.messages{display:flex;flex-direction:column;gap:7px}.messages p{margin:0;background:#272d30;padding:7px 12px;border-radius:10px;max-width:80%;align-self:flex-start;white-space:pre-wrap;overflow-wrap:anywhere}.messages p.mine{align-self:flex-end;background:#214a40}.messages small{color:#94a3a5}form input{flex:1;min-width:0}.chat :global(.picker){flex-wrap:nowrap}.chat :global(.picker label){font-size:10px}.chat :global(select){padding:2px 4px}.knowledge input{background:#171b1d;border:1px solid #394248;border-radius:6px;padding:6px;color:inherit}@media(max-width:700px){.kbhead{flex-wrap:wrap}.searchtools{margin-left:auto}.spread{grid-template-columns:1fr 1fr}.panelhead{flex-wrap:wrap}.knowledge button{padding:4px 7px;font-size:12px}.paper{padding:8px}.chat .panelhead{flex-wrap:nowrap}.chat :global(select){max-width:120px}}
.knowledge{grid-template-rows:auto minmax(0,var(--upper)) 10px minmax(0,1fr);gap:0}.kbhead{justify-content:flex-end;padding-bottom:8px}.spread{grid-template-columns:var(--map) 10px minmax(0,1fr);gap:0}.lower{display:grid;grid-template-columns:minmax(0,3fr) minmax(140px,1fr);gap:10px;min-height:0}.dream-card{position:relative;overflow:auto}.dream-card p,.dream-card small{display:block;margin:5px 0}.dream-card .dreams{position:static;max-height:none}.chat :global(.picker label){font-size:12px}.chat :global(.picker){flex-wrap:wrap}.chat :global(select){padding:5px}.paper select{max-width:100%}.paper{overflow-wrap:anywhere}.atlas.expanded,.reader.expanded{background-color:var(--panel)}@media(max-width:700px){.lower{grid-template-columns:minmax(0,1fr) 110px}.dream-card{padding:6px}.chat .panelhead{flex-wrap:wrap;max-height:45%;overflow:auto}.chat :global(.picker){gap:2px}}
.knowledge .lower{grid-template-columns:minmax(0,var(--chat)) 10px minmax(0,1fr);gap:0}.dream-title{display:flex;gap:8px;align-items:center}.dream-title span{color:var(--muted);font-size:24px}.dream-card{background:linear-gradient(130deg,transparent 60%,#67b09a20),var(--panel);border-top:2px solid #648e80}.dream-card button{margin:5px 4px 0 0}.dream-card small{color:var(--muted)}footer svg{display:block}.kbhead{flex-wrap:wrap}.searchtools{max-width:100%;flex-wrap:wrap}
.knowledge [hidden]{display:none!important}.knowledge.singleRow{grid-template-rows:auto minmax(0,1fr)}.knowledge .solo{grid-template-columns:minmax(0,1fr)}.kbhead{justify-content:space-between;gap:8px}.pane-switches{display:flex;gap:10px;flex-wrap:wrap}.pane-switches label{display:flex;align-items:center;gap:4px;font-size:13px}.pane-close{padding:2px 7px;font-size:18px;line-height:1.2}.panelhead strong,.dream-title strong{margin-right:auto}.searchtools svg{vertical-align:middle}
</style>
