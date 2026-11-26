'use strict';
const express=require('express');
const {rateLimit}=require('express-rate-limit');
const {requireAuth}=require('../auth/middleware');
const schemas=require('./validation');
const {createRunService}=require('./service');
const {createRunRetention}=require('./retention');
const {createTerritoryService}=require('../territory/service');
function createRunRouter(options){
  const {prisma,config}=options,router=express.Router(),runs=createRunService(options),territory=createTerritoryService({prisma}),retention=createRunRetention(options);
  router.use(requireAuth({prisma,config,clock:options.clock}));
  function validate(schema,source='body'){return(req,res,next)=>{const result=schema.safeParse(req[source]??{});if(!result.success)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Check the supplied run details.'}});req[source+'Input']=result.data;next();};}
  const writes=rateLimit({windowMs:15*60000,limit:config.runWriteLimit,standardHeaders:'draft-8',legacyHeaders:false,keyGenerator:req=>req.authUser.id,
    handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Run syncing is busy. Your saved data is safe; try again shortly.'}})});
  const version=(req,res,next)=>{const value=req.get('x-app-version-code')??req.bodyInput?.device?.versionCode,code=typeof value==='number'?value:/^\d+$/.test(value||'')?Number(value):NaN;
    if(!Number.isSafeInteger(code)||code<config.minAppVersion)return res.status(426).json({error:{code:'UPDATE_REQUIRED',message:'Update Territory Run before starting or syncing a run. Saved data stays on this phone.'}});next();};
  const json=express.json({limit:'512kb',strict:true,inflate:false});
  router.get('/',validate(schemas.list,'query'),async(req,res)=>res.json(await runs.list(req,req.queryInput)));
  router.get('/:id/claim',validate(schemas.params,'params'),async(req,res)=>res.json(await territory.claim(req,req.paramsInput.id)));
  router.get('/:id',validate(schemas.params,'params'),validate(schemas.detail,'query'),async(req,res)=>res.json(await runs.detail(req,req.paramsInput.id,req.queryInput)));
  router.post('/',json,validate(schemas.create),writes,version,async(req,res)=>{const result=await runs.create(req,req.bodyInput);res.status(result.created?201:200).json(result);});
  router.post('/:id/points',validate(schemas.params,'params'),json,validate(schemas.batch),writes,version,async(req,res)=>res.json(await runs.points(req,req.paramsInput.id,req.bodyInput)));
  router.post('/:id/signals',validate(schemas.params,'params'),json,validate(schemas.signal),writes,version,async(req,res)=>res.json(await runs.signals(req,req.paramsInput.id,req.bodyInput)));
  for(const action of ['pause','resume'])router.post(`/:id/${action}`,validate(schemas.params,'params'),json,validate(schemas.control),writes,version,async(req,res)=>res.json(await runs.control(req,req.paramsInput.id,req.bodyInput,action)));
  router.post('/:id/finish',validate(schemas.params,'params'),json,validate(schemas.finish),writes,version,async(req,res)=>res.json(await runs.finish(req,req.paramsInput.id,req.bodyInput)));
  router.post('/:id/end-stale',validate(schemas.params,'params'),json,validate(schemas.empty),writes,version,async(req,res)=>res.json(await runs.endStale(req,req.paramsInput.id)));
  router.delete('/:id',validate(schemas.params,'params'),json,validate(schemas.empty),validate(schemas.empty,'query'),writes,version,async(req,res)=>{await runs.remove(req,req.paramsInput.id);res.status(204).end();});
  return {router,retention};
}
module.exports={createRunRouter};
