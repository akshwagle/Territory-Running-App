'use strict';
const { z } = require('zod');
const { normalizeDisplayName } = require('./names');
const { AVATAR_COLORS } = require('./profile');

const empty=z.strictObject({});
const id=z.uuid();
const profilePatch=z.strictObject({
  displayName:z.string().transform(normalizeDisplayName).refine(v=>v!==null).optional(),
  avatarId:z.number().int().min(0).max(11).optional(),
  avatarColor:z.string().transform(v=>v.toUpperCase()).refine(v=>AVATAR_COLORS.includes(v)).optional(),
  preferredUnits:z.enum(['km','mi']).optional(),
  bio:z.string().transform(v=>v.normalize('NFKC').trim()).refine(v=>[...v].length<=140&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v)).optional(),
  homeRegionId:id.nullable().optional(),
}).refine(v=>Object.keys(v).length>0);
const privacyPatch=z.strictObject({profileVisibility:z.enum(['PUBLIC','FOLLOWERS','PRIVATE']).optional(),
  appearOnLeaderboards:z.boolean().optional(),shareRouteShapes:z.boolean().optional()}).refine(v=>Object.keys(v).length>0);
const params=z.strictObject({id});
module.exports={empty,profilePatch,privacyPatch,params};
