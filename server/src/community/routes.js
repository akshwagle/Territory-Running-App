'use strict';
const express=require('express');
const {rateLimit}=require('express-rate-limit');
const {z}=require('zod');
const {requireAuth}=require('../auth/middleware');
const {createCommunityService,MAX_PAGE}=require('./service');

const page=z.coerce.number().int().min(1).max(MAX_PAGE);
const boardQuery=z.strictObject({metric:z.enum(['hexes','distance','runs']).default('hexes'),period:z.enum(['week','month','season','all']).default('week'),
  scope:z.enum(['global','following','team']).default('global'),limit:page.default(25),offset:z.coerce.number().int().min(0).max(5000).default(0)});
const listQuery=z.strictObject({limit:page.default(25),cursor:z.string().max(300).optional()});
const searchQuery=z.strictObject({q:z.string().transform(v=>v.normalize('NFKC').trim()).refine(v=>[...v].length>=2&&[...v].length<=30)});
const empty=z.strictObject({});
const idParams=z.strictObject({id:z.uuid()});
const bad=/[\u0000-\u001f\u007f‪-‮⁦-⁩]/u;
const createBody=z.strictObject({
  name:z.string().transform(v=>v.normalize('NFKC').trim().replace(/\s+/g,' ')).refine(v=>[...v].length>=3&&[...v].length<=50&&!bad.test(v)),
  colorHex:z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(v=>v.toUpperCase())});
const joinBody=z.strictObject({inviteCode:z.string().transform(v=>v.trim().toUpperCase()).refine(v=>/^[A-Z2-9]{6,12}$/.test(v))});

function createCommunityRouter({prisma,config,clock}){
  const router=express.Router(),service=createCommunityService({prisma,clock}),auth=requireAuth({prisma,config,clock});
  const json=express.json({limit:'4kb',strict:true,inflate:false});
  const writes=label=>rateLimit({windowMs:15*60000,limit:config.profileWriteLimit,standardHeaders:'draft-8',legacyHeaders:false,
    keyGenerator:req=>`${label}:${req.authUser.id}`,
    handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests. Please try again later.'}})});
  router.use(['/community','/teams','/me/followers','/me/following','/users'],(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const check=(schema,source)=>(req,res,next)=>{
    const r=schema.safeParse(req[source]??{});
    if(!r.success)return res.status(400).json({error:{code:'INVALID_INPUT',message:'Check the supplied details.'}});
    req[`${source}Input`]=r.data;next();
  };
  const q=schema=>check(schema,'query'),b=schema=>check(schema,'body'),p=check(idParams,'params');
  const wrap=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){next(e);}};

  router.get('/community/leaderboard',auth,q(boardQuery),wrap(async(req,res)=>res.json(await service.leaderboard(req,req.queryInput))));
  router.get('/community/season',auth,q(empty),wrap(async(req,res)=>res.json(await service.currentSeason(req))));
  router.get('/community/feed',auth,q(listQuery),wrap(async(req,res)=>res.json(await service.feed(req,req.queryInput))));
  router.get('/community/search',auth,q(searchQuery),wrap(async(req,res)=>res.json(await service.search(req,req.queryInput))));
  router.get('/community/team-leaderboard',auth,q(empty),wrap(async(req,res)=>res.json(await service.teamBoard(req))));
  router.get('/me/followers',auth,q(listQuery),wrap(async(req,res)=>res.json(await service.followers(req,req.queryInput))));
  router.get('/me/following',auth,q(listQuery),wrap(async(req,res)=>res.json(await service.following(req,req.queryInput))));
  router.put('/users/:id/follow',auth,p,q(empty),writes('follow'),wrap(async(req,res)=>res.json(await service.follow(req,req.paramsInput.id))));
  router.delete('/users/:id/follow',auth,p,q(empty),writes('follow'),wrap(async(req,res)=>res.json(await service.unfollow(req,req.paramsInput.id))));

  router.get('/teams/me',auth,q(empty),wrap(async(req,res)=>res.json(await service.myTeam(req))));
  router.get('/teams/me/members',auth,q(empty),wrap(async(req,res)=>res.json(await service.members(req))));
  router.post('/teams',auth,json,b(createBody),writes('team'),wrap(async(req,res)=>res.status(201).json(await service.createTeam(req,req.bodyInput))));
  router.post('/teams/join',auth,json,b(joinBody),writes('team'),wrap(async(req,res)=>res.json(await service.joinTeam(req,req.bodyInput))));
  router.post('/teams/leave',auth,json,b(empty),writes('team'),wrap(async(req,res)=>res.json(await service.leaveTeam(req))));
  router.delete('/teams/me/members/:id',auth,p,q(empty),writes('team'),wrap(async(req,res)=>res.json(await service.removeMember(req,req.paramsInput.id))));
  return {router,service};
}
module.exports={createCommunityRouter};
