import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { createId } from '@paralleldrive/cuid2';
import { dataSourceOptions } from '../common/database/data-source';
import { User } from '../users/entities/user.entity';
import { Role } from '../common/enums/role.enum';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `[admin] ${name} is required — refusing to seed with a default credential`,
    );
  }
  return value;
}

async function main() {
  // Credenciais são obrigatórias: nunca cair para um valor literal (ex.:
  // "admin123"), que criaria/resetaria um admin com senha trivial em produção.
  const email = required('ADMIN_EMAIL');
  const name = process.env.ADMIN_NAME?.trim() || email;
  const password = required('ADMIN_PASSWORD');

  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  const userRepo = dataSource.getRepository(User);

  const existing = await userRepo.findOne({ where: { email } });
  const passwordHash = await argon2.hash(password);

  if (existing) {
    // Promove a ADMIN mas NÃO sobrescreve a senha de uma conta já ativada —
    // re-rodar o seed não pode resetar a credencial de um admin existente.
    existing.role = Role.ADMIN;
    if (!existing.passwordHash) existing.passwordHash = passwordHash;
    if (!existing.name) existing.name = name;
    await userRepo.save(existing);
    console.log(
      `[admin] updated existing user ${email} -> role=ADMIN` +
        (existing.passwordHash === passwordHash
          ? ' (password set)'
          : ' (password left unchanged)'),
    );
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
  console.log(`[admin] done. login: ${email}`);
}

main().catch((err) => {
  console.error('[admin] failed:', err);
  process.exit(1);
});
