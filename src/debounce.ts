export function debounce(fn:()=>void, ms:number) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  const run=()=>{clearTimeout(timer); timer=setTimeout(fn,ms);};
  run.cancel=()=>clearTimeout(timer);
  return run;
}
