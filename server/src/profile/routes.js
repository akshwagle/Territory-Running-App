'use strict';
const express=require('express');
const {rateLimit}=require('express-rate-limit');
const {z}=require('zod');
const schemas=require('./validation');
const {requireAuth}=require('../auth/middleware');
const {createProfileService}=require('./profile');
const {createPrivacyService}=require('./privacy');
const {createConsentService}=require('./consents');
const {createAccountJobs}=require('./jobs');
const {createExportService}=require('./exports');
const {createDeletionService}=require('./deletion');

const deleteBody=z.union([
  z.strictObject({confirmation:z.literal('DELETE'),password:z.string().min(1).max(128)}),
  z.strictObject({confirmation:z.literal('DELETE'),idToken:z.string().min(10).max(8192)}),
]);
function createProfileRouter(options) {
  const {prisma,config,clock,logger}=options;
  const router=express.Router(),auth=requireAuth({prisma,config,clock});
  const jobs=createAccountJobs(logger),exports=createExportService({...options,jobs,directory:options.exportDir,
    cleanupAdditional:()=>options.mailer?.cleanupOrphans?.(prisma)});
  const profile=createProfileService({prisma}),privacy=createPrivacyService({prisma}),consents=createConsentService({prisma,config});
  const deletion=createDeletionService({...options,jobs,exports});
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
  for(const [name,service,patchSchema] of [['profile',profile,schemas.profilePatch],['privacy',privacy,schemas.privacyPatch]]) {
    router.get(`/me/${name}`,auth,validate(schemas.empty,'query'),async(req,res)=>res.json(await service.get(req)));
    router.patch(`/me/${name}`,auth,json,validate(patchSchema),writes(name),async(req,res)=>res.json(await service.patch(req,req.bodyInput)));
  }
  router.get('/users/:id/profile',auth,validate(schemas.params,'params'),validate(schemas.empty,'query'),async(req,res)=>res.json(await profile.publicProfile(req,req.paramsInput.id)));
  router.get('/admin/users/:id/name-history',auth,validate(schemas.params,'params'),validate(schemas.empty,'query'),async(req,res)=>res.json(await profile.history(req,req.paramsInput.id)));
  router.get('/me/consents',auth,validate(schemas.empty,'query'),async(req,res)=>res.json(await consents.get(req)));
  router.post('/me/consents',auth,json,validate(schemas.consentBody),writes('consent'),async(req,res)=>res.json(await consents.post(req,req.bodyInput)));
  router.post('/me/export',auth,json,validate(schemas.empty),writes('export',config.exportRequestLimit),async(req,res)=>res.status(202).json(await exports.create(req)));
  router.get('/me/export/:id',requireAuth({prisma,config,clock,allowMissingUser:true}),validate(schemas.params,'params'),validate(schemas.empty,'query'),async(req,res)=>{
    const result=await exports.get(req,req.paramsInput.id);
    if(result.pending)return res.status(202).json({export:result.export});
    res.attachment('territory-run-data.json').type('application/json');return res.json(result.data);
  });
  router.delete('/me',requireAuth({prisma,config,clock,allowMissingUser:true}),json,validate(deleteBody),writes('delete',5),async(req,res)=>{
    await deletion.remove(req,req.bodyInput);res.status(204).end();
  });
  return {router,jobs:{...jobs,...exports}};
}
module.exports={createProfileRouter,deleteBody};
