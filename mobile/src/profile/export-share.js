import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { ApiError } from '../auth/errors.js';

const folder='territory-exports';
export function createExportShare({platform=Capacitor.getPlatform(),files=Filesystem,share=Share,lifecycle=App}={}) {
  async function cleanup() {
    if(platform!=='android')return;
    let listing;
    try {listing=await files.readdir({path:folder,directory:Directory.Cache});}
    catch(error){if(error.code==='OS-PLUG-FILE-0008'||/not exist|not found|no such/i.test(error.message||''))return;throw error;}
    for(const file of listing.files)if(/^export-[\w-]+\.json$/.test(file.name))await files.deleteFile({path:`${folder}/${file.name}`,directory:Directory.Cache});
  }
  async function send(data) {
    if(platform!=='android')throw new ApiError('ANDROID_REQUIRED','Open the Android app to share your export.');
    await cleanup();
    await files.mkdir({path:folder,directory:Directory.Cache,recursive:true}).catch(error=>{if(!/exist/i.test(error.message||''))throw error;});
    const path=`${folder}/export-${crypto.randomUUID()}.json`;
    let stopped=false,returned=false,resolveResume;
    const resumed=new Promise(resolve=>{resolveResume=resolve;});
    const listener=await lifecycle.addListener('appStateChange',({isActive})=>{
      if(!isActive)stopped=true;
      else if(stopped){returned=true;resolveResume();}
    });
    try {
      await files.writeFile({path,directory:Directory.Cache,data:JSON.stringify(data,null,2),encoding:Encoding.UTF8});
      const {uri}=await files.getUri({path,directory:Directory.Cache});
      await share.share({title:'Your Territory Run data',dialogTitle:'Share your JSON export',files:[uri]});
      // Android may resolve at chooser selection, before the receiving app has
      // read the URI. Keep cache until this app resumes, then delete it.
      if(stopped&&!returned)await resumed;
    } finally {
      await listener.remove();
      await files.deleteFile({path,directory:Directory.Cache});
    }
  }
  return {send,cleanup};
}
export const exportShare=createExportShare();
