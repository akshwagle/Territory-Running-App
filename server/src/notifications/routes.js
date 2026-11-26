'use strict';
const express=require('express');
const {z}=require('zod');
const {requireAuth}=require('../auth/middleware');
const {createNotificationService}=require('./service');
const listQuery=z.strictObject({limit:z.coerce.number().int().min(1).max(50).optional(),cursor:z.string().max(80).optional(),unread:z.enum(['true','false']).optional().transform(v=>v==='true')});
const empty=z.strictObject({});
const idParams=z.strictObject({id:z.uuid().transform(v=>v.toLowerCase())});
function createNotificationRouter({prisma,config,clock}){
  const router=express.Router(),service=createNotificationService({prisma}),auth=requireAuth({prisma,config,clock});
  router.use('/me/notifications',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const check=(schema,source)=>(req,res,next)=>{const r=schema.safeParse(req[source]??{});if(!r.success)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Check the supplied details.'}});req[`${source}Input`]=r.data;next();};
  const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};
  router.get('/me/notifications',auth,check(listQuery,'query'),wrap(async(req,res)=>res.json(await service.list(req,req.queryInput))));
  router.get('/me/notifications/unread-count',auth,wrap(async(req,res)=>res.json(await service.unreadCount(req))));
  router.post('/me/notifications/read-all',auth,express.json({limit:'1kb'}),check(empty,'body'),wrap(async(req,res)=>res.json(await service.markAllRead(req))));
  router.post('/me/notifications/:id/read',auth,check(idParams,'params'),express.json({limit:'1kb'}),check(empty,'body'),wrap(async(req,res)=>res.json(await service.markRead(req,req.paramsInput.id))));
  return {router,service};
}
module.exports={createNotificationRouter};
