declare const __DEV__:boolean;
export function log(component:string,message:string) {
  if(typeof __DEV__!=='undefined' && __DEV__)console.debug(`[${component}] ${message}`);
}
