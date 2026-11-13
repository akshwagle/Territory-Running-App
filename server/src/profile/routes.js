'use strict';
const express=require('express');
const {rateLimit}=require('express-rate-limit');
const schemas=require('./validation');
const {requireAuth}=require('../auth/middleware');
const {createProfileService}=require('./profile');

function createProfileRouter(options) {
  const {prisma,config,clock}=options;
  const router=express.Router(),auth=requireAuth({prisma,config,clock});
  const profile=createProfileService({prisma});
  function validate(schema,source='body') {
    return (req,res,next)=>{
      const result=schema.safeParse(req[source]??{});
      if(!result.success)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Check the supplied details.'}});
      req[`${source}Input`]=result.data;next();
    };
  }
  const writes=(label,limit=config.profileWriteLimit)=>rateLimit({windowMs:15*60000,limit,
    standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>`${label}:${req.authUser.id}`,
    handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests. Please try again later.'}})});
  router.use(['/me/profile','/me/privacy','/me/consents','/me/export','/me','/users','/admin'],(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const json=express.json({limit:'16kb',strict:true,inflate:false});
  for(const [name,service,patchSchema] of [['profile',profile,schemas.profilePatch]]) {
    router.get(`/me/${name}`,auth,validate(schemas.empty,'query'),async(req,res)=>res.json(await service.get(req)));
    router.patch(`/me/${name}`,auth,json,validate(patchSchema),writes(name),async(req,res)=>res.json(await service.patch(req,req.bodyInput)));
  }
  router.get('/admin/users/:id/name-history',auth,validate(schemas.params,'params'),validate(schemas.empty,'query'),async(req,res)=>res.json(await profile.history(req,req.paramsInput.id)));
  return {router};
}
module.exports={createProfileRouter};
