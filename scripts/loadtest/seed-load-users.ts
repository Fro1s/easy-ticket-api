import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { createId } from '@paralleldrive/cuid2';
import { dataSourceOptions } from '../../src/common/database/data-source';
import { User } from '../../src/users/entities/user.entity';
import { Role } from '../../src/common/enums/role.enum';

/**
 * Provisions N throwaway buyers for the JMeter on-sale test and writes a CSV of
 * pre-signed access tokens.
 *
 * Why tokens are signed here instead of logged in from JMeter: `POST /auth/login`
 * is throttled to 5 req/min per IP (auth.controller.ts). 100 virtual users
 * logging in from one load generator would leave 95 of them holding a 429, and
 * the run would measure the auth throttler instead of the checkout path. Signing
 * locally sidesteps auth entirely while still producing tokens the API accepts:
 * JwtStrategy resolves `sub` against the users table, so the rows must exist —
 * hence the insert.
 *
 * Tokens are signed with a long TTL because the default is 15m and a test run
 * plus setup can outlive that.
 *
 * REFUSES TO RUN AGAINST PRODUCTION. This writes users and is meant for the
 * disposable Neon branch only. Point DATABASE_URL at the branch, not at prod.
 */

const COUNT = Number(process.env.LOADTEST_USERS ?? 100);
const TOKEN_TTL = process.env.LOADTEST_TOKEN_TTL ?? '4h';
const EMAIL_PREFIX = 'loadtest+';
const EMAIL_DOMAIN = 'easyticket-loadtest.invalid';
const OUT_FILE = path.resolve(__dirname, 'tokens.csv');

/**
 * The only thing standing between this script and a production users table.
 * Neon branch hostnames carry `br-`/the branch id, but that is not reliable
 * enough to detect on its own, so we require an explicit opt-in instead.
 */
function assertNotProduction(): void {
  if (process.env.LOADTEST_I_KNOW_THIS_IS_NOT_PROD !== 'yes') {
    throw new Error(
      'Refusing to run without LOADTEST_I_KNOW_THIS_IS_NOT_PROD=yes.\n' +
        'This inserts users. Point DATABASE_URL at the disposable Neon branch\n' +
        'first, confirm it is NOT the production branch, then re-run.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run with NODE_ENV=production.');
  }
}

async function main() {
  assertNotProduction();

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET is required to sign test tokens.');

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);

  const rows: string[] = ['token'];
  let created = 0;
  let reused = 0;

  for (let i = 0; i < COUNT; i++) {
    const email = `${EMAIL_PREFIX}${i}@${EMAIL_DOMAIN}`;
    let user = await userRepo.findOne({ where: { email } });

    if (user) {
      reused++;
    } else {
      user = await userRepo.save(
        userRepo.create({
          email,
          name: `Load Test ${i}`,
          role: Role.BUYER,
          // No password hash: these accounts exist only to satisfy the JWT
          // strategy's user lookup. They cannot be logged into.
          passwordHash: null,
          referralCode: createId().slice(0, 10).toUpperCase(),
          cpf: null,
          phone: null,
          producerId: null,
        }),
      );
      created++;
    }

    // Mirrors the payload auth.service.ts signs: { sub, email, role }.
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn: TOKEN_TTL } as jwt.SignOptions,
    );
    rows.push(token);
  }

  fs.writeFileSync(OUT_FILE, rows.join('\n') + '\n', 'utf8');
  await dataSource.destroy();

  console.log(
    `[loadtest] ${created} created, ${reused} reused -> ${COUNT} buyers`,
  );
  console.log(`[loadtest] tokens (valid ${TOKEN_TTL}) written to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('[loadtest] failed:', err);
  process.exit(1);
});
