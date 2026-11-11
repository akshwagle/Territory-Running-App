'use strict';

require('dotenv').config({ path: require('node:path').join(__dirname, '../.env') });
const { createHash } = require('node:crypto');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const settings = [
  ['h3_resolution', '11', 'H3 resolution used when recording territory'],
  ['claim_cooldown_minutes', '30', 'Minutes before another runner may capture a hex'],
  ['max_speed_mps', '8.5', 'Maximum accepted running speed in metres per second'],
  ['max_gps_jump_m', '100', 'Maximum accepted distance between successive GPS points'],
  ['min_gps_accuracy_m', '30', 'GPS accuracy threshold in metres; validation is implemented in a later phase'],
  ['decay_days', '14', 'Days before inactive territory decays'],
];

const badges = [
  { code: 'TOTAL_DISTANCE_10KM', name: 'First 10 km', criteria: 'TOTAL_DISTANCE', threshold: 10000, description: 'Run a cumulative 10,000 metres.' },
  { code: 'HEX_COUNT_100', name: 'Century of hexes', criteria: 'HEX_COUNT', threshold: 100, description: 'Hold 100 territory hexes.' },
  { code: 'STREAK_DAYS_7', name: 'One week strong', criteria: 'STREAK_DAYS', threshold: 7, description: 'Run on seven consecutive days.' },
  { code: 'RUN_COUNT_10', name: 'Ten runs', criteria: 'RUN_COUNT', threshold: 10, description: 'Complete ten valid runs.' },
];

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!process.env.DATABASE_URL || !email || !password) {
    throw new Error('Set DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD before seeding.');
  }
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address of at most 255 characters.');
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be at most 72 UTF-8 bytes (bcrypt limit).');
  }

  const prisma = new PrismaClient({ log: [] });
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const username = `admin_${createHash('sha256').update(email).digest('hex').slice(0, 20)}`;
    await prisma.$transaction(async (tx) => {
      for (const [key, value, description] of settings) {
        // Defaults only: preserve values tuned after an earlier seed.
        await tx.gameSetting.upsert({ where: { key }, create: { key, value, description }, update: {} });
      }
      for (const badge of badges) {
        await tx.badge.upsert({ where: { code: badge.code }, create: badge, update: badge });
      }
      const admin = await tx.user.upsert({
        where: { email },
        create: { username, email, passwordHash, displayName: 'Administrator', role: 'ADMIN' },
        // A rerun must not rotate a password or escalate an existing runner.
        update: {},
      });
      if (admin.role !== 'ADMIN') {
        throw new Error('ADMIN_EMAIL belongs to a non-admin user; choose a different ADMIN_EMAIL.');
      }
      // Dates are calculated only for the first insert; reruns preserve dates/status.
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const endsAt = new Date(startsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      await tx.season.upsert({
        where: { name: 'Season 1' },
        create: { name: 'Season 1', startsAt, endsAt, status: 'UPCOMING' },
        update: {},
      });
      await tx.region.upsert({
        where: { name: 'Demo Region' },
        create: { name: 'Demo Region', city: 'Demo City' },
        update: {},
      });
    }, { timeout: 30000 });
    console.log('Seed complete: default settings, badge catalog, admin, upcoming season and demo region.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Avoid logging connection URLs, credentials or Prisma query arguments.
  console.error(`Seed failed: ${error instanceof Error && !error.name.startsWith('Prisma') ? error.message : 'database operation failed; check connectivity and migrations'}`);
  process.exitCode = 1;
});
