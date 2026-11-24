import type { Choice, Available } from "./studio";
const key = "verified-models-v1";
export function identity(m: Pick<Choice,"provider"|"model"|"endpoint">) {
  return JSON.stringify([m.provider,m.endpoint??"",m.model]);
}
export function verified():Available[] {
  try {return JSON.parse(localStorage.getItem(key)??"[]")} catch {return []}
}
export function remember(m:Choice, success:boolean) {
 const list=verified(), id=identity(m);
 const old=list.find(v=>identity(v)===id);
 const levels=(old?.levels??[]).filter(l=>l!==m.thinking);
 if(success)levels.push(m.thinking);
 const next=list.filter(v=>identity(v)!==id);
 if(levels.length) next.push({...m,levels});
 localStorage.setItem(key,JSON.stringify(next));
 return next;
}
export function isVerified(choice:Choice){return verified().some(m=>identity(m)===identity(choice)&&m.levels.includes(choice.thinking))}
