'use strict';
const {z}=require('zod');
const id=z.uuid().transform(value=>value.toLowerCase());
const date=z.iso.datetime({offset:true}).transform(value=>new Date(value));
const finite=z.number().finite();
const sha=z.string().regex(/^[0-9a-f]{64}$/);
const position=z.strictObject({lat:finite.min(-90).max(90),lng:finite.min(-180).max(180),accuracyM:finite.nonnegative().optional()}).refine(p=>p.lat!==0||p.lng!==0);
const device=z.strictObject({installId:id,androidIdHash:sha.nullable(),versionCode:z.number().int().positive(),
  appVersion:z.string().min(1).max(20),signingCertificateSha256:sha.nullable(),model:z.string().min(1).max(100),
  androidVersion:z.string().min(1).max(30),timeZone:z.string().min(1).max(80).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}}),
  mockAppSelected:z.boolean().nullable(),emulator:z.boolean(),debugger:z.boolean()});
const event=z.strictObject({id,type:z.enum(['GPS_OFF','GPS_ON','PERMISSION_LOST','PROCESS_RECOVERY','REBOOT_RECOVERY','CLOCK_JUMP','NO_MOVEMENT','PAUSED_MOVEMENT','SESSION_END','CONSENT_WITHDRAWN','LOW_STORAGE','GAP']),
  recordedAt:date,elapsedMs:finite.nonnegative().max(86400000).optional(),data:z.strictObject({gapMs:finite.nonnegative().optional(),fromSeq:z.number().int().nonnegative().optional(),toSeq:z.number().int().nonnegative().optional(),clockDeltaMs:finite.optional(),reason:z.string().max(80).optional()}).optional()});
const events=z.array(event).max(1000).default([]);
const point=z.strictObject({seq:z.number().int().min(0).max(2147483647),lat:finite.min(-90).max(90),lng:finite.min(-180).max(180),recordedAt:date,
  accuracyM:finite.nonnegative(),speedMps:finite.nonnegative().nullable(),altitudeM:finite.nullable(),bearingDeg:finite.min(0).lt(360).nullable(),
  provider:z.enum(['gps','network','fused','passive','unknown']),isMock:z.boolean().nullable(),segmentId:id.optional(),elapsedMs:finite.nonnegative().max(86400000),deviceTimestamp:date})
  .refine(p=>p.lat!==0||p.lng!==0);
const create=z.strictObject({clientRunId:id,startedAt:date,device});
const batch=z.strictObject({batchKey:z.string().min(3).max(60),points:z.array(point).min(1).max(500),events,
  batteryLevel:finite.min(0).max(100).nullable(),stepDelta:z.number().int().min(0).max(100000).nullable(),invalidDropped:z.number().int().min(0).max(100000).default(0)});
const control=z.strictObject({eventId:id,recordedAt:date,elapsedMs:finite.nonnegative().max(86400000),position:position.nullable().optional(),
  reason:z.enum(['USER','GPS_OFF','PERMISSION_LOST','NO_MOVEMENT','PROCESS_RECOVERY','SESSION_END','CONSENT_WITHDRAWN','LOW_STORAGE','GPS_ON','FOREGROUND_ONLY']).default('USER'),events});
const signal=z.strictObject({eventId:id,events:z.array(event).min(1).max(1000)});
const finish=z.strictObject({endedAt:date,events,reason:z.enum(['USER','STATIONARY','RECOVERY','LIMIT']).default('USER'),invalidDroppedTotal:z.number().int().min(0).max(100000).optional(),lastSeq:z.number().int().min(-1).max(2147483647).optional()});
const list=z.strictObject({limit:z.coerce.number().int().min(1).max(100).default(20),cursor:z.string().max(256).optional(),active:z.enum(['true','false']).optional()});
const detail=z.strictObject({afterSeq:z.coerce.number().int().min(-1).max(2147483647).default(-1),pointLimit:z.coerce.number().int().min(1).max(2000).default(1000)});
module.exports={id,position,device,event,point,create,batch,control,signal,finish,list,detail,params:z.strictObject({id}),empty:z.strictObject({})};
