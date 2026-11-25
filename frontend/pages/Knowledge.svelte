<script lang="ts">
 import {onMount,tick} from "svelte";
 import Divider from "../lib/components/Divider.svelte";
 import {savedSize} from "../lib/layout";
 import {paneNames,initialTree,loadTree,layout,dock,position,type Pane,type Edge,type Box} from "../lib/docking";
 let tree=$state(loadTree(initialTree(savedSize("map",.53,.3,.7),savedSize("chat",.72,.35,.82),savedSize("upper",.55,.28,.72))));
 $effect(()=>localStorage.setItem("knowledge-dock-v1",JSON.stringify(tree)));
 let width=$state(0),height=$state(0),board:HTMLDivElement;
 let source=$state<Pane|null>(null),target=$state<Pane|null>(null),edge=$state<Edge>("left");
 const geometry=$derived(layout(tree,panes,width,height));
 function aim(e:PointerEvent){
   if(!source)return;
   const r=board.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
   target=null;
   for(const key of paneKeys){
     const b=geometry.boxes[key];
     if(!b||key===source)continue;
     const dx=(x-b.left)/b.width,dy=(y-b.top)/b.height;
     if(dx<0||dx>1||dy<0||dy>1)continue;
     const distances=[dx,1-dx,dy,1-dy];
     edge=(["left","right","top","bottom"] as const)[distances.indexOf(Math.min(...distances))];
     target=key;break;
   }
 }
 function finish(){if(source&&target)tree=dock(tree,source,target,edge);source=null;target=null}
 function preview(b:Box,e:Edge):Box{
   if(e==="left"||e==="right")return {...b,left:b.left+(e==="right"?b.width/2:0),width:b.width/2};
   return {...b,top:b.top+(e==="bottom"?b.height/2:0),height:b.height/2};
 }
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
 function resetLayout(){for(const key of paneKeys)setPane(key,defaults[key]);tree=initialTree();tick().then(fit)}
 let latest=$state(localStorage.getItem("dream-last-check")??"");
 import cytoscape from "cytoscape";
 import {buildObsidianGraph,computeClusteredPositions,filterObsidianGraph,type ObsidianLegendItem} from "../lib/knowledgeGraphTheme";
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
 let selected=$state(""),hoveredNode=$state(""),search=$state(""),question=$state(""),status=$state(""),busy=$state(false),showDreams=$state(false),showEdgeLabels=$state(false);
 let subjectFilter=$state("all"),localDepth=$state<"all"|1|2>("all"),graphLayoutMode=$state<"clustered"|"force"|"radial">("clustered");
 const fullModel=$derived(buildObsidianGraph(data));
 const visibleModel=$derived(filterObsidianGraph(fullModel,{subjectId:subjectFilter,focusId:selected,localDepth}));
 const node=$derived(data.concepts.find(n=>n.id===selected));
 const matches=$derived(search.trim()?data.concepts.filter(n=>(n.label+" "+n.summary).toLowerCase().includes(search.trim().toLowerCase())).slice(0,8):[]);
 const active=$derived(threads.find(t=>t.id===thread));
 const documentText=$derived(docs[docIndex]?.body??(node?"# "+node.label+"\n\n"+node.summary:"Select a node to read its note."));
 $effect(()=>{localStorage.setItem("knowledge-threads",JSON.stringify(threads))});
 $effect(()=>{const id=selected;let live=true;docs=[];docIndex=0;if(id&&panes.note)invokeTauri<typeof docs>("concept_markdown",{conceptId:id}).then(v=>{if(live)docs=v}).catch(e=>{if(live)status=String(e)});return()=>{live=false}});
 function updateLod(){
  if(!cy)return;
  const showLeaves=visibleModel.nodes.length<18||cy.zoom()>=0.72;
  cy.nodes().forEach(n=>{
   const isHub=Boolean(n.data("isHub"));
   const pinned=n.hasClass("focused")||n.hasClass("neighbor")||n.selected();
   n.toggleClass("lod-leaf-hidden",!showLeaves&&!isHub&&!pinned);
  });
 }
 function applyHighlight(focusId:string){
  if(!cy)return;
  cy.elements().removeClass("focused neighbor edge-focus dimmed");
  if(!focusId){updateLod();return}
  const target=cy.getElementById(focusId);
  if(!target.length){updateLod();return}
  const neighborhood=target.closedNeighborhood();
  cy.elements().not(neighborhood).addClass("dimmed");
  target.addClass("focused");
  neighborhood.nodes().not(target).addClass("neighbor");
  neighborhood.edges().addClass("edge-focus");
  updateLod();
 }
 function toggleEdgeLabels(){
  showEdgeLabels=!showEdgeLabels;
  cy?.edges().toggleClass("show-label",showEdgeLabels);
 }
 async function selectSubject(id:string){
  subjectFilter=id;
  await tick();
  if(!visibleModel.nodes.some(n=>n.data.id===selected)){
   selected=visibleModel.nodes[0]?.data.id??selected;
   await tick();
  }
  draw();
 }
 async function changeLocalDepth(raw:string){
  localDepth=raw==="1"?1:raw==="2"?2:"all";
  await tick();
  draw();
 }
 async function changeLayoutMode(raw:string){
  graphLayoutMode=raw==="force"?"force":raw==="radial"?"radial":"clustered";
  await tick();
  draw();
 }
 async function focus(id:string,openNote=true){
  if(openNote){if(full==="graph")full="";setPane("note",true)}
  if(selected!==id){thread="";question=""}
  selected=id;search="";
  if(localDepth!=="all"){await tick();draw();return}
  const n=cy?.getElementById(id);
  if(n?.length){cy?.elements().unselect();n.select();applyHighlight(id);cy?.animate({fit:{eles:n.closedNeighborhood(),padding:60},duration:260})}
 }
 function fit(){cy?.resize();cy?.fit(undefined,48);updateLod()}
 function applyDefaultZoom(){
  if(!cy)return;
  const targetZoom=Math.min(4.2,cy.zoom()*4);
  const focusNode=selected?cy.getElementById(selected):cy.nodes().first();
  if(focusNode&&focusNode.length){
   cy.zoom({level:targetZoom,position:focusNode.position()});
   cy.center(focusNode);
  }else{
   cy.zoom({level:targetZoom,renderedPosition:{x:cy.width()/2,y:cy.height()/2}});
  }
  updateLod();
 }
 async function expand(name:string){full=full===name?"":name;await tick();fit()}
 function draw(){
  cy?.destroy();cy=undefined;
  const model=visibleModel;
  if(!panes.graph||!host?.clientWidth)return;
  const dense=model.nodes.length>80;
  let layoutConfig:cytoscape.LayoutOptions;
  if(graphLayoutMode==="clustered"){
   const positions=computeClusteredPositions(model.nodes,model.edges);
   layoutConfig={name:"preset",positions:(ele)=>positions[ele.id()]??{x:0,y:0},fit:true,padding:48,animate:model.nodes.length<=150,animationDuration:280};
  }else if(graphLayoutMode==="radial"){
   layoutConfig={name:"concentric",fit:true,padding:48,minNodeSpacing:36,concentric:(n)=>(n.id()===selected?100:Number(n.data("degree")??0)+1),levelWidth:()=>2};
  }else{
   layoutConfig={name:"cose",animate:model.nodes.length<=120,animationDuration:320,padding:48,fit:true,componentSpacing:110,nodeRepulsion:()=>22000,idealEdgeLength:()=>105,edgeElasticity:()=>100,gravity:0.42,nodeOverlap:26,numIter:500};
  }
  cy=cytoscape({
   container:host,
   elements:[...model.nodes,...model.edges],
   layout:layoutConfig,
   minZoom:.14,
   maxZoom:4.5,
   hideEdgesOnViewport:dense,
   textureOnViewport:dense,
   style:[
    {selector:"node",style:{
     shape:"ellipse",
     width:"data(size)",
     height:"data(size)",
     "background-color":"data(color)",
     "background-opacity":0.92,
     "border-color":"data(borderColor)",
     "border-width":1.5,
     label:"data(label)",
     "text-valign":"bottom",
     "text-halign":"center",
     "text-margin-y":7,
     "text-wrap":"ellipsis",
     "text-max-width":"135px",
     "font-size":11.5,
     "font-weight":500,
     color:"#cbd5e1",
     "text-outline-color":"#0b0f17",
     "text-outline-width":2.2,
     "transition-property":"opacity, border-width, border-color",
     "transition-duration":140,
    }},
    {selector:"node.lod-leaf-hidden",style:{label:""}},
    {selector:"edge",style:{
     width:1.2,
     "line-color":"#475569",
     "line-opacity":dense?0.28:0.44,
     "curve-style":"bezier",
     "target-arrow-shape":dense?"none":"triangle",
     "target-arrow-color":"#475569",
     "arrow-scale":0.7,
     "font-size":9.5,
     color:"#94a3b8",
     "text-outline-color":"#0b0f17",
     "text-outline-width":1.6,
     "transition-property":"opacity, line-color, width",
     "transition-duration":140,
    }},
    {selector:"edge.show-label",style:{label:"data(label)"}},
    {selector:"edge.edge-focus",style:{
     width:2.2,
     "line-color":"#38bdf8",
     "line-opacity":0.95,
     "target-arrow-shape":"triangle",
     "target-arrow-color":"#38bdf8",
     label:"data(label)",
     color:"#e2e8f0",
     "z-index":15,
    }},
    {selector:"node.neighbor",style:{
     opacity:1,
     "border-width":2,
     "border-color":"#e2e8f0",
     color:"#f1f5f9",
     label:"data(label)",
     "z-index":20,
    }},
    {selector:"node.focused, node:selected",style:{
     opacity:1,
     "border-color":"#ffffff",
     "border-width":3,
     color:"#ffffff",
     "font-weight":700,
     label:"data(label)",
     "z-index":30,
    }},
    {selector:".dimmed",style:{opacity:0.15}},
   ]
  });
  cy.one("layoutstop",applyDefaultZoom);
  cy.edges().toggleClass("show-label",showEdgeLabels);
  cy.on("zoom",updateLod);
  cy.on("mouseover","node",e=>{hoveredNode=e.target.id();applyHighlight(hoveredNode)});
  cy.on("mouseout","node",()=>{hoveredNode="";applyHighlight(selected)});
  cy.on("tap","node",e=>focus(e.target.id()));
  cy.on("tap",e=>{if(e.target===cy){hoveredNode="";applyHighlight(selected)}});
  if(selected&&cy.getElementById(selected).length){cy.getElementById(selected).select();applyHighlight(selected)}else{updateLod()}
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
<svelte:window onkeydown={e=>{if(e.key==="Escape"){source=null;target=null;full="";historyOpen=false;search="";showDreams=false;tick().then(fit)}}}/>
{#snippet grip(key:Pane,title:string)}
 <button class="grip" aria-label={"Move "+paneNames[key]} title="Drag to a pane edge to dock" disabled={!!full}
 onpointerdown={e=>{if(e.button===0){source=key;target=null;e.currentTarget.setPointerCapture(e.pointerId)}}}
 onpointermove={aim} onpointerup={e=>{aim(e);finish()}} onlostpointercapture={()=>{source=null;target=null}}>
 <span aria-hidden="true">⠿</span> {title}</button>
{/snippet}
<section class="knowledge singleRow"><header class="kbhead"><div class="pane-switches" role="group" aria-label="Visible panes">{#each paneKeys as pane}<label><input type="checkbox" checked={panes[pane]} onchange={e=>setPane(pane,e.currentTarget.checked)}/>{paneNames[pane]}</label>{/each}</div><div class="searchtools"><button onclick={resetLayout}>Reset layout</button>
<div class="find"><input placeholder="Find a concept…" aria-label="Find a concept" bind:value={search} onkeydown={e=>{if(e.key==="Enter"&&matches[0])focus(matches[0].id)}}/>
{#if search}<div class="menu">{#each matches as n}<button onclick={()=>focus(n.id)}>{n.label}</button>{:else}<span>No matching concepts</span>{/each}</div>{/if}</div>
<button title="Chat history" aria-label="Chat history" onclick={()=>historyOpen=!historyOpen}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 4H4v14h4v3l5-3h7Z"/><path d="M8 9h8m-8 4h5"/></svg></button>
{#if historyOpen}<div class="history menu"><button onclick={()=>{thread="";question="";setPane("chat",true);historyOpen=false}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 4H4v14h4v3l5-3h7Z"/><path d="M9 11h6m-3-3v6"/></svg> New chat</button>{#each threads as t}<button onclick={()=>{focus(t.concept,false);setPane("chat",true);thread=t.id;historyOpen=false}}>{t.title}</button>{:else}<span>No saved chats</span>{/each}</div>{/if}</div></header>
<div class="dock-board" bind:this={board} bind:clientWidth={width} bind:clientHeight={height}><section class:expanded={full==="graph"} class="atlas" style={full==="graph"?"":position(geometry.boxes.graph)} hidden={!panes.graph}><div class="panelhead">{@render grip("graph","Concept map" )}<button aria-label={full==="graph"?"Restore":"Expand graph"} title={full==="graph"?"Restore":"Expand graph"} onclick={()=>expand("graph")}>{full==="graph"?"⤡":"⛶"}</button><button class="pane-close" aria-label="Close Concept map" title="Close Concept map" onclick={()=>setPane("graph",false)}>×</button></div>
{#if fullModel.legend.length}
 <div class="subject-bar" role="region" aria-label="Subject filters">
  <button class:active={subjectFilter==="all"} onclick={()=>selectSubject("all")}>All subjects ({fullModel.nodes.length})</button>
  {#each fullModel.legend as item}
   <button class:active={subjectFilter===item.clusterId} onclick={()=>selectSubject(item.clusterId)}><i style={"background:"+item.color}></i><span>{item.label}</span><small>{item.count}</small></button>
  {/each}
 </div>
{/if}
<div class="map" bind:this={host}></div>{#if !data.concepts.length}<p class="empty">Add a lecture to your graph to explore its concepts.</p>{/if}
<footer>
 <div class="graph-actions">
  <button title="Fit graph" aria-label="Fit graph" onclick={fit}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><rect x="7" y="8" width="10" height="8" rx="1"/></svg></button>
  <select aria-label="Graph layout" value={graphLayoutMode} onchange={e=>changeLayoutMode((e.currentTarget as HTMLSelectElement).value)}>
   <option value="clustered">Clustered</option>
   <option value="force">Force</option>
   <option value="radial">Radial</option>
  </select>
  <select aria-label="Local neighborhood depth" value={String(localDepth)} onchange={e=>changeLocalDepth((e.currentTarget as HTMLSelectElement).value)}>
   <option value="all">Full graph</option>
   <option value="1">1-hop local</option>
   <option value="2">2-hop local</option>
  </select>
  <button title="Re-layout graph" onclick={draw}>Re-layout</button>
  <button class:active={showEdgeLabels} aria-pressed={showEdgeLabels} onclick={toggleEdgeLabels}>Labels</button>
 </div>
 <div class="graph-legend" aria-label="Graph summary">
  <small>{visibleModel.nodes.length}/{fullModel.nodes.length} concepts · {visibleModel.edges.length} links</small>
 </div>
</footer>
</section>
<section class:expanded={full==="note"} class="reader" style={full==="note"?"":position(geometry.boxes.note)} hidden={!panes.note}><div class="panelhead">{@render grip("note",docs.length?"Lecture note":"Concept note")}{#if docs.length}<button onclick={()=>invokeTauri("open_concept_note",{conceptId:selected,index:docIndex}).catch(e=>status=String(e))}>Open .md</button>{/if}<button aria-label={full==="note"?"Restore":"Expand note"} title={full==="note"?"Restore":"Expand note"} onclick={()=>expand("note")}>{full==="note"?"⤡":"⛶"}</button><button class="pane-close" aria-label="Close Lecture note" title="Close Lecture note" onclick={()=>setPane("note",false)}>×</button></div>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard scrolling for the note reader) -->
<div class="paper" tabindex="0" role="region" aria-label="Markdown note">{#if docs.length>1}<select aria-label="Lecture note" bind:value={docIndex}>{#each docs as d,i}<option value={i}>{d.title}.md</option>{/each}</select>{/if}
{#each documentText.split("\n") as line}{#if line.startsWith("## ")}<h3>{line.slice(3)}</h3>{:else if line.startsWith("# ")}<h2>{line.slice(2)}</h2>{:else if line.trim()}<p>{line}</p>{/if}{/each}
{#if node}<details><summary>Sources and connections</summary>{#each node.links as l}<p>{l.source_refs.join(", ")}</p>{/each}{#each data.edges.filter(e=>e.from_concept_id===selected||e.to_concept_id===selected) as e}{@const other=e.from_concept_id===selected?e.to_concept_id:e.from_concept_id}<button onclick={()=>focus(other)}>{data.concepts.find(n=>n.id===other)?.label??other}</button>{/each}</details>{/if}</div></section>
<section class="chat" style={full==="chat"?"":position(geometry.boxes.chat)} hidden={!panes.chat}><div class="panelhead">{@render grip("chat","Knowledge chat" )}<ModelPicker label="Chat" bind:choice/><button class="pane-close" aria-label="Close Knowledge chat" title="Close Knowledge chat" onclick={()=>setPane("chat",false)}>×</button></div>
<div class="messages" bind:this={log} aria-live="polite">{#each active?.messages??[] as m}<p class:mine={m.role==="user"}>{m.text}</p>{:else}<small>{node?"Ask about "+node.label:"Select a concept to start chatting."}</small>{/each}{#if busy}<small>Working…</small>{/if}{#if status}<p role="status">{status}</p>{/if}</div>
<form onsubmit={e=>{e.preventDefault();ask()}}><input placeholder="Message about this concept…" aria-label="Knowledge message" bind:value={question}/><button disabled={busy||!node||!question.trim()}>Send</button></form></section><aside class="dream-card card" style={full==="dream"?"":position(geometry.boxes.dream)} hidden={!panes.dream}><header class="dream-title"><span aria-hidden="true">✧</span>{@render grip("dream","Dreaming" )}<button class="pane-close" aria-label="Close Dreaming" title="Close Dreaming" onclick={()=>setPane("dream",false)}>×</button></header><p>Explore links between your {data.concepts.length} saved concepts.</p><small>{latest?"Last checked "+latest:"No checks yet"}</small><button disabled={busy||!node} onclick={dream}>✧ Check graph</button><button onclick={()=>showDreams=!showDreams}>{data.dream_suggestions.filter(d=>d.status==="pending").length} pending</button>{#if showDreams}<div class="dreams menu"><button onclick={()=>showDreams=false}>Close suggestions</button>{#each data.dream_suggestions.filter(d=>d.status==="pending") as d}<p>{d.title}</p><small>{d.rationale}</small><button onclick={()=>review(d.id,true)}>Accept</button><button onclick={()=>review(d.id,false)}>Dismiss</button>{:else}<p>No pending suggestions.</p>{/each}</div>{/if}</aside>
{#each geometry.bars as bar}
 <div class="dock-divider" style={position(bar.box)}><Divider vertical={bar.node.axis==="y"} extent={bar.span} label="Resize docked panes" adjust={fraction=>{

 bar.node.fraction=Math.max(.15,Math.min(.85,bar.node.fraction+fraction));
 }}/></div>
{/each}
{#if target&&geometry.boxes[target]}<div class="dock-preview" style={position(preview(geometry.boxes[target]!,edge))}>Dock {edge}</div>{/if}
{#if !upper&&!lower}<p>Choose a pane above to open it.</p>{/if}</div></section>
<style>
.knowledge{flex:1;min-height:0;display:grid;grid-template-rows:auto minmax(0,1.3fr) minmax(0,1fr);gap:10px}.kbhead,.searchtools,.panelhead,footer,form{display:flex;align-items:center;justify-content:space-between;gap:8px}.searchtools,.find{position:relative}.find input{width:clamp(120px,17vw,280px)}.menu{position:absolute;z-index:5;top:100%;right:0;background:#171c20;border:1px solid #414c54;padding:7px;border-radius:8px;min-width:170px;max-height:32vh;overflow:auto}.menu button{display:block;width:100%;text-align:left}.spread{min-height:0;display:grid;grid-template-columns:1.15fr 1fr;gap:10px}.atlas,.reader,.chat{min-height:0;min-width:0;border:1px solid #30383c;border-radius:10px;display:flex;flex-direction:column;overflow:hidden;background:#101315}.atlas{position:relative;background-color:#0b0f17;background-image:radial-gradient(circle at 50% 42%,#131c2e 0%,#0b0f17 75%)}.subject-bar{display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid #1e293b;background:#0e1420;overflow-x:auto;flex:none}.subject-bar button{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;font-size:11.5px;border-radius:999px;white-space:nowrap;border:1px solid #293548;background:#121927;color:#cbd5e1}.subject-bar button.active{background:#f8fafc;color:#0b0f17;border-color:#f8fafc;font-weight:600}.subject-bar button i{width:8px;height:8px;border-radius:999px;flex:none}.subject-bar button small{opacity:0.75;font-size:10.5px}.graph-actions,.graph-legend{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.graph-actions select{font-size:12px;padding:4px 7px}.graph-actions button.active{background:#f8fafc;color:#0b0f17;font-weight:600}.panelhead,footer,form{padding:7px 12px}.panelhead{border-bottom:1px solid #2b3035;background:#15191b}.map,.paper,.messages{flex:1;min-height:0}.paper,.messages{overflow:auto;padding:12px 18px}.paper{background:#191b1b;color:#e1dfd7;line-height:1.6}.paper h2,.paper h3{font-family:Georgia,serif}.empty{position:absolute;top:40%;align-self:center;font-size:13px;pointer-events:none}.expanded{position:fixed;inset:8px;z-index:20}.dreams{top:44px;bottom:45px;max-height:none}.messages{display:flex;flex-direction:column;gap:7px}.messages p{margin:0;background:#272d30;padding:7px 12px;border-radius:10px;max-width:80%;align-self:flex-start;white-space:pre-wrap;overflow-wrap:anywhere}.messages p.mine{align-self:flex-end;background:#214a40}.messages small{color:#94a3a5}form input{flex:1;min-width:0}.chat :global(.picker){flex-wrap:nowrap}.chat :global(.picker label){font-size:10px}.chat :global(select){padding:2px 4px}.knowledge input{background:#171b1d;border:1px solid #394248;border-radius:6px;padding:6px;color:inherit}@media(max-width:700px){.kbhead{flex-wrap:wrap}.searchtools{margin-left:auto}.spread{grid-template-columns:1fr 1fr}.panelhead{flex-wrap:wrap}.knowledge button{padding:4px 7px;font-size:12px}.paper{padding:8px}.chat .panelhead{flex-wrap:nowrap}.chat :global(select){max-width:120px}}
.knowledge{grid-template-rows:auto minmax(0,var(--upper)) 10px minmax(0,1fr);gap:0}.kbhead{justify-content:flex-end;padding-bottom:8px}.spread{grid-template-columns:var(--map) 10px minmax(0,1fr);gap:0}.lower{display:grid;grid-template-columns:minmax(0,3fr) minmax(140px,1fr);gap:10px;min-height:0}.dream-card{position:relative;overflow:auto}.dream-card p,.dream-card small{display:block;margin:5px 0}.dream-card .dreams{position:static;max-height:none}.chat :global(.picker label){font-size:12px}.chat :global(.picker){flex-wrap:wrap}.chat :global(select){padding:5px}.paper select{max-width:100%}.paper{overflow-wrap:anywhere}.atlas.expanded,.reader.expanded{background-color:var(--panel)}@media(max-width:700px){.lower{grid-template-columns:minmax(0,1fr) 110px}.dream-card{padding:6px}.chat .panelhead{flex-wrap:wrap;max-height:45%;overflow:auto}.chat :global(.picker){gap:2px}}
.knowledge .lower{grid-template-columns:minmax(0,var(--chat)) 10px minmax(0,1fr);gap:0}.dream-title{display:flex;gap:8px;align-items:center}.dream-title span{color:var(--muted);font-size:24px}.dream-card{background:linear-gradient(130deg,transparent 60%,#67b09a20),var(--panel);border-top:2px solid #648e80}.dream-card button{margin:5px 4px 0 0}.dream-card small{color:var(--muted)}footer svg{display:block}.kbhead{flex-wrap:wrap}.searchtools{max-width:100%;flex-wrap:wrap}
.knowledge [hidden]{display:none!important}.knowledge.singleRow{grid-template-rows:auto minmax(0,1fr)}.knowledge .solo{grid-template-columns:minmax(0,1fr)}.kbhead{justify-content:space-between;gap:8px}.pane-switches{display:flex;gap:10px;flex-wrap:wrap}.pane-switches label{display:flex;align-items:center;gap:4px;font-size:13px}.pane-close{padding:2px 7px;font-size:18px;line-height:1.2}.panelhead strong,.dream-title strong{margin-right:auto}.searchtools svg{vertical-align:middle}
.dock-board{position:relative;min-height:0;min-width:0}.dock-board>:is(.atlas,.reader,.chat,.dream-card):not(.expanded),.dock-preview,.dock-divider{position:absolute}.dock-divider{display:flex}.dock-divider :global(.divider){width:100%;height:100%}.dock-preview{pointer-events:none;background:#498fa744;border:2px solid #6cb9d4;z-index:10;display:grid;place-items:center;border-radius:8px;font-weight:600}.grip{display:flex;gap:6px;align-items:center;flex:1;min-width:0;text-align:left;background:transparent;border:0;color:inherit;font-weight:650;cursor:grab;touch-action:none;user-select:none;padding:5px}.grip span{color:var(--muted)}.grip:active{cursor:grabbing}@media(max-width:760px){.dock-board{display:flex;flex-direction:column;gap:10px;overflow:auto}.dock-board>:is(.atlas,.reader,.chat,.dream-card):not(.expanded){position:static;inset:auto!important;width:100%!important;height:auto!important;min-height:260px}.dock-divider{display:none}}
</style>