'use strict';
const express=require('express');
const {z}=require('zod');
const {requireAuth}=require('../auth/middleware');
const {createTerritoryService}=require('./service');
const num=min=>z.coerce.number().finite().min(min).max(-min);
const mineQuery=z.strictObject({limit:z.coerce.number().int().min(1).max(200).default(100),cursor:z.string().max(200).optional()});
const boxQuery=z.strictObject({minLat:num(-90),minLng:num(-180),maxLat:num(-90),maxLng:num(-180)});
function createTerritoryRouter({prisma,config,clock}){
  const router=express.Router(),service=createTerritoryService({prisma});
  router.use(requireAuth({prisma,config,clock}));
  const parse=(schema,req,res)=>{const r=schema.safeParse(req.query??{});if(!r.success){res.status(400).json({error:{code:'INVALID_INPUT',message:'Check the supplied map details.'}});return null;}return r.data;};
  router.get('/me',async(req,res)=>{const q=parse(mineQuery,req,res);if(q)res.json(await service.mine(req,q));});
  router.get('/hexes',async(req,res)=>{const q=parse(boxQuery,req,res);if(q)res.json(await service.map(req,q));});
  return {router,service};
}
module.exports={createTerritoryRouter};
