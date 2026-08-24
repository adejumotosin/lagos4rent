import { supabase } from './config.js';
import { buildQuery, emptyListings, propertyCard, skeletonCards } from './common.js';

const grid=document.querySelector('#featured-grid');
if(grid){
  grid.innerHTML=skeletonCards(3);
  const{data,error}=await supabase.from('marketplace_listings').select('*').order('featured',{ascending:false}).order('published_at',{ascending:false}).limit(6);
  if(error){console.error(error);grid.innerHTML=emptyListings('Listings are temporarily unavailable. Please try again shortly.')}else if(!data?.length){grid.innerHTML=emptyListings('No public listings yet. Agents and tenants can submit homes for review from their dashboard.')}else{grid.innerHTML=data.map(propertyCard).join('')}
}
const form=document.querySelector('#home-search');form?.addEventListener('submit',e=>{e.preventDefault();const q=buildQuery(Object.fromEntries(new FormData(form).entries()));location.href=`/listings${q?`?${q}`:''}`});