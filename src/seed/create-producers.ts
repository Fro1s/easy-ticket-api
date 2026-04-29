import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import { createId } from '@paralleldrive/cuid2';
import { dataSourceOptions } from '../common/database/data-source';
import { User } from '../users/entities/user.entity';
import { Producer } from '../producers/entities/producer.entity';
import { Role } from '../common/enums/role.enum';

interface ProducerUserSeed {
  email: string;
  name: string;
}

const PRODUCER_NAME = 'Projeto Criança Feliz';
const PASSWORD = process.env.PRODUCER_PASSWORD ?? 'pcf2026!';
const USERS: ProducerUserSeed[] = [
  { email: 'leticia.silveira@projetocriancafeliz.org', name: 'Letícia Silveira' },
  { email: 'matheus.frois@projetocriancafeliz.org', name: 'Matheus Frois' },
];

async function main() {
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  const producerRepo = dataSource.getRepository(Producer);
  const userRepo = dataSource.getRepository(User);

  // Find or create the producer org.
  let producer = await producerRepo.findOne({ where: { name: PRODUCER_NAME } });
  if (!producer) {
    producer = await producerRepo.save(
      producerRepo.create({
        name: PRODUCER_NAME,
        cnpj: null,
        absorbFee: false,
      }),
    );
    console.log(`[producers] created producer "${PRODUCER_NAME}" (${producer.id})`);
  } else {
    console.log(`[producers] using existing producer "${PRODUCER_NAME}" (${producer.id})`);
  }

  const passwordHash = await argon2.hash(PASSWORD);

  for (const seed of USERS) {
    const existing = await userRepo.findOne({ where: { email: seed.email } });
    if (existing) {
      existing.role = Role.PRODUCER;
      existing.producerId = producer.id;
      existing.passwordHash = passwordHash;
      if (!existing.name) existing.name = seed.name;
      await userRepo.save(existing);
      console.log(`[producers] updated user ${seed.email} -> role=PRODUCER, producerId=${producer.id}`);
    } else {
      await userRepo.save(
        userRepo.create({
          email: seed.email,
          name: seed.name,
          role: Role.PRODUCER,
          passwordHash,
          referralCode: createId().slice(0, 10).toUpperCase(),
          cpf: null,
          phone: null,
          producerId: producer.id,
        }),
      );
      console.log(`[producers] created user ${seed.email} -> role=PRODUCER`);
    }
  }

  await dataSource.destroy();
  console.log(`[producers] done. login with any of: ${USERS.map((u) => u.email).join(', ')} / password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error('[producers] failed:', err);
  process.exit(1);
});
