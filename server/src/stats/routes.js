'use strict';
const express=require('express');
const {z}=require('zod');
const {requireAuth}=require('../auth/middleware');
const {createStatsService}=require('./service');
const overviewQuery=z.strictObject({range:z.enum(['week','month','year']).default('week')});
const splitsQuery=z.strictObject({unit:z.enum(['km','mi']).default('km')});
const empty=z.strictObject({});
const idParams=z.strictObject({id:z.uuid().transform(v=>v.toLowerCase())});
function createStatsRouter({prisma,config,clock}){
  const router=express.Router(),service=createStatsService({prisma}),auth=requireAuth({prisma,config,clock});
  router.use(['/me/stats','/me/run-splits'],(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const check=(schema,source)=>(req,res,next)=>{const r=schema.safeParse(req[source]??{});if(!r.success)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Check the supplied details.'}});req[`${source}Input`]=r.data;next();};
  const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  router.get('/me/stats/overview',auth,check(overviewQuery,'query'),wrap(async(req,res)=>res.json(await service.overview(req,req.queryInput))));
  router.get('/me/stats/records',auth,check(empty,'query'),wrap(async(req,res)=>res.json(await service.records(req))));
  router.get('/me/stats/achievements',auth,check(empty,'query'),wrap(async(req,res)=>res.json(await service.achievements(req))));
  router.get('/me/run-splits/:id',auth,check(idParams,'params'),check(splitsQuery,'query'),wrap(async(req,res)=>res.json(await service.splits(req,req.paramsInput.id,req.queryInput))));
  return {router,service};
}
module.exports={createStatsRouter};
