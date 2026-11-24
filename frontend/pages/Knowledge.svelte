<script lang="ts">
 import {onMount} from "svelte";
 import cytoscape from "cytoscape";
 import {invokeTauri,type KnowledgeGraphSnapshot} from "../lib/tauriApi";
 let host:HTMLDivElement,cy:cytoscape.Core|undefined,selected=$state(""),search=$state("");
 let data=$state<KnowledgeGraphSnapshot>({concepts:[],edges:[],dream_suggestions:[]});
 const panes={graph:true};
 function focus(id:string){selected=id;search="";cy?.fit(cy.getElementById(id).closedNeighborhood(),45)}
 function draw(){
  cy?.destroy();cy=undefined;if(!panes.graph||!host?.clientWidth)return;cy=cytoscape({container:host,elements:[...data.concepts.map(n=>({data:{id:n.id,label:n.label}})),...data.edges.map(e=>({data:{id:e.id,source:e.from_concept_id,target:e.to_concept_id}}))],
    layout:{name:"cose",animate:false,padding:50},minZoom:.15,maxZoom:1.45,
    style:[{selector:"node",style:{"shape":"round-rectangle","width":"label","height":23,padding:"8px",label:"data(label)","text-valign":"center","text-wrap":"ellipsis","text-max-width":"150px","font-size":12,color:"#ecf1f5","background-color":"#222b34","border-color":"#526272","border-width":1}},
    {selector:"edge",style:{width:1.6,"line-color":"#52616c","curve-style":"bezier","target-arrow-shape":"triangle","target-arrow-color":"#52616c"}},
    {selector:"node:selected",style:{"background-color":"#b7d4ca","border-color":"#cbecdd",color:"#10251d"}}]});
  cy.on("tap","node",e=>focus(e.target.id()));cy.getElementById(selected).select()
 }
 onMount(()=>{let live=true;invokeTauri<KnowledgeGraphSnapshot>("get_knowledge_graph").then(g=>{if(live){data=g;draw()}});return()=>{live=false;cy?.destroy()}});
</script>
<label>Find a concept <input bind:value={search}/></label>
{#if search}{#each data.concepts.filter(n=>n.label.toLowerCase().includes(search.toLowerCase())) as n}<button onclick={()=>focus(n.id)}>{n.label}</button>{/each}{/if}
<div bind:this={host} style="min-height:300px;flex:1"></div>
