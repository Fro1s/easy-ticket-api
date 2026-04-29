import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { createId } from '@paralleldrive/cuid2';
import { dataSourceOptions } from '../common/database/data-source';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'matheuscosta1150@gmail.com';
  const name = process.env.ADMIN_NAME ?? 'Matheus Frois';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);

  const existing = await userRepo.findOne({ where: { email } });
  const passwordHash = await argon2.hash(password);

  if (existing) {
    existing.role = Role.ADMIN;
    existing.passwordHash = passwordHash;
    if (!existing.name) existing.name = name;
    await userRepo.save(existing);
    console.log(`[admin] updated existing user ${email} -> role=ADMIN, password reset`);
  } else {
    await userRepo.save(
      userRepo.create({
        email,
        name,
        role: Role.ADMIN,
        passwordHash,
        referralCode: createId().slice(0, 10).toUpperCase(),
        cpf: null,
        phone: null,
        producerId: null,
      }),
    );
    console.log(`[admin] created new user ${email} -> role=ADMIN`);
  }

  await dataSource.destroy();
  console.log(`[admin] done. login: ${email} / password: ${password}`);
}

main().catch((err) => {
  console.error('[admin] failed:', err);
  process.exit(1);
});
