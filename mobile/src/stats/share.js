import {Capacitor} from '@capacitor/core';
import {Share} from '@capacitor/share';
// Uses the @capacitor/share plugin already shipped for data export; no new plugin.
export async function canShare({platform=Capacitor.getPlatform(),share=Share}={}){
  if(platform==='android')return share.canShare?(await share.canShare()).value!==false:true;
  return typeof navigator!=='undefined'&&typeof navigator.share==='function';
}
export async function shareSummary(text,{platform=Capacitor.getPlatform(),share=Share}={}){
  try{
    if(platform==='android')await share.share({title:'My run',text,dialogTitle:'Share run'});
    else await navigator.share({title:'My run',text});
    return true;
  }catch(error){if(/cancel|abort/i.test(`${error?.name} ${error?.message}`))return false;throw error;}
}
