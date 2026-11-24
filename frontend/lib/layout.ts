export function savedSize(key:string,initial:number,min:number,max:number){
 const raw=localStorage.getItem("pane-"+key);
 const n=Number(raw);
 return raw!==null && Number.isFinite(n)?Math.min(max,Math.max(min,n)):initial;
}
export function saveSize(key:string,value:number){localStorage.setItem("pane-"+key,String(value))}
