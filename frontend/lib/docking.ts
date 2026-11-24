export const paneNames = {graph:"Concept map", note:"Lecture note", chat:"Knowledge chat", dream:"Dreaming"};
export type Pane = keyof typeof paneNames;
export type Edge = "left"|"right"|"top"|"bottom";
type Split = {axis:"x"|"y", fraction:number, first:Tree, second:Tree};
export type Tree = Pane | Split;
export type Box = {left:number,top:number,width:number,height:number};
const keys = Object.keys(paneNames);
export function initialTree(map=.53,chat=.72,upper=.55):Tree {
  return {axis:"y",fraction:upper,first:{axis:"x",fraction:map,first:"graph",second:"note"},
    second:{axis:"x",fraction:chat,first:"chat",second:"dream"}};
}
export function loadTree(fallback:Tree):Tree {
  try {
    const tree=JSON.parse(localStorage.getItem("knowledge-dock-v1")??"null");
    const seen=new Set<string>();
    function valid(n:Tree):boolean {
      if(typeof n==="string"){if(!keys.includes(n)||seen.has(n))return false;seen.add(n);return true}
      return !!n && ["x","y"].includes(n.axis) && n.fraction>=.15 && n.fraction<=.85 && valid(n.first) && valid(n.second);
    }
    if(valid(tree)&&seen.size===keys.length)return tree;
  }catch{}
  return fallback;
}
export function dock(tree:Tree,source:Pane,target:Pane,edge:Edge):Tree {
  if(source===target)return tree;
  function remove(n:Tree):Tree|null {
    if(typeof n==="string")return n===source?null:n;
    const first=remove(n.first),second=remove(n.second);
    return first&&second?{...n,first,second}:first??second;
  }
  function insert(n:Tree):Tree {
    if(typeof n!=="string")return {...n,first:insert(n.first),second:insert(n.second)};
    if(n!==target)return n;
    const before=edge==="left"||edge==="top";
    return {axis:edge==="left"||edge==="right"?"x":"y",fraction:.5,first:before?source:target,second:before?target:source};
  }
  return insert(remove(tree)!);
}
export function layout(tree:Tree,visible:Record<Pane,boolean>,width:number,height:number){
  const boxes:Partial<Record<Pane,Box>>={};
  const bars:{node:Split,box:Box,span:number}[]=[];
  function shown(n:Tree):boolean{return typeof n==="string"?visible[n]:shown(n.first)||shown(n.second)}
  function visit(n:Tree,b:Box){
    if(typeof n==="string"){if(visible[n])boxes[n]=b;return}
    if(!shown(n.first)){visit(n.second,b);return}
    if(!shown(n.second)){visit(n.first,b);return}
    const horizontal=n.axis==="x", size=horizontal?"width":"height", start=horizontal?"left":"top";
    const gap=Math.min(10,b[size]),span=b[size]-gap,cut=span*n.fraction;
    visit(n.first,{...b,[size]:cut});
    bars.push({node:n,span,box:{...b,[start]:b[start]+cut,[size]:gap}});
    visit(n.second,{...b,[start]:b[start]+cut+gap,[size]:span-cut});
  }
  visit(tree,{left:0,top:0,width,height});
  return {boxes,bars};
}
export function position(b?:Box){
  return b?'left:'+b.left+'px;top:'+b.top+'px;width:'+b.width+'px;height:'+b.height+'px':'';
}
