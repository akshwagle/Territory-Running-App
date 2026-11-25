'use strict';
const {canView}=require('../profile/privacy');
// Public/shared reads are opt-in for future routes. Step 05 always leaves
// allowShared false, even for administrators and PUBLIC profiles.
function ownerOrCanView(viewer,owner,{allowShared=false,includeRoute=false,isFollower=false}={}){
  return viewer?.id===owner?.id ? canView(viewer,owner) : allowShared&&canView(viewer,owner,{isFollower})&&(!includeRoute||owner.privacy?.hideRoute===false);
}
module.exports={ownerOrCanView};
