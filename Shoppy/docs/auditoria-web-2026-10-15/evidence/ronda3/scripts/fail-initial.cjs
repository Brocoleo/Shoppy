const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=typeof input==='string'?input:input?.url||String(input);
 if(url.includes('.supabase.co/rest/v1/products?')&&url.includes('limit=8'))return Promise.resolve(new Response(JSON.stringify({message:'Simulated initial read failure'}),{status:503,headers:{'content-type':'application/json'}}));
 return originalFetch(input,init);
};
