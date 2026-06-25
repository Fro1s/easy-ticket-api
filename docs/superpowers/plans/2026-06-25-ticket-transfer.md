# Ticket Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o dono de um ticket o transfira para outro usuário já cadastrado (por email ou CPF), invalidando o ticket original e gerando um ticket novo para o destinatário.

**Architecture:** Endpoint autenticado `POST /tickets/:id/transfer`. A decisão de elegibilidade e resolução do destinatário vive em funções puras testáveis (`src/.../lib/`), seguindo a convenção do projeto (importar serviços no Jest quebra por causa do cuid2 ESM). A orquestração (transação + email best-effort) fica em `TicketsService.transfer`. O ticket original vira `TRANSFERRED` (+ `transferredToUserId`) e um ticket novo, com `qrToken`/`shortCode` novos, é criado para o destinatário. A portaria já rejeita status `!= VALID`, então o QR antigo deixa de funcionar sem mudança extra.

**Tech Stack:** NestJS 11, TypeORM, class-validator/class-transformer, Jest, CUID2, Resend (email via `EmailModule` global).

## Global Constraints

- Valores monetários em centavos (inteiros) — não aplicável aqui, mas mantenha o padrão.
- Primary keys via `createId()` do `@paralleldrive/cuid2`.
- `shortCode` no formato `ET-` + 9 chars maiúsculos do cuid; `qrToken` no formato `et:{orderId}:{cuid}`.
- Nenhuma migration: os campos `transferredToUserId` e o status `TicketStatus.TRANSFERRED` já existem.
- Testes de serviço com entidades TypeORM quebram o Jest (cadeia cuid2 ESM) — só teste lógica pura extraída em `lib/`.
- Comandos: `pnpm test <arquivo>` para um teste; `pnpm build` para typecheck; `pnpm lint` para ESLint.

---

### Task 1: `normalizeCpf` (lib pura)

**Files:**
- Create: `src/users/lib/normalize-cpf.ts`
- Test: `src/users/lib/normalize-cpf.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizeCpf(cpf: string): string` — remove todos os caracteres não-dígito e retorna só os dígitos.

- [ ] **Step 1: Write the failing test**

```ts
// src/users/lib/normalize-cpf.spec.ts
import { normalizeCpf } from './normalize-cpf';

describe('normalizeCpf', () => {
  it('remove pontos e traço de um CPF formatado', () => {
    expect(normalizeCpf('123.456.789-00')).toBe('12345678900');
  });

  it('deixa um CPF só com dígitos inalterado', () => {
    expect(normalizeCpf('12345678900')).toBe('12345678900');
  });

  it('remove espaços ao redor', () => {
    expect(normalizeCpf('  123.456.789-00  ')).toBe('12345678900');
  });

  it('remove qualquer caractere não numérico', () => {
    expect(normalizeCpf('cpf: 111a222b333c44')).toBe('11122233344');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/users/lib/normalize-cpf.spec.ts`
Expected: FAIL — `Cannot find module './normalize-cpf'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/users/lib/normalize-cpf.ts
/**
 * Canonicaliza um CPF para uso como chave de identidade: remove tudo que não
 * é dígito. A validação de "11 dígitos" é responsabilidade do DTO; aqui só
 * normalizamos para que "123.456.789-00" e "12345678900" resolvam na mesma chave.
 */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/users/lib/normalize-cpf.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/users/lib/normalize-cpf.ts src/users/lib/normalize-cpf.spec.ts
git commit -m "feat(users): add normalizeCpf helper"
```

---

### Task 2: `resolveRecipientLookup` (lib pura)

**Files:**
- Create: `src/tickets/lib/resolve-recipient-lookup.ts`
- Test: `src/tickets/lib/resolve-recipient-lookup.spec.ts`

**Interfaces:**
- Consumes: `normalizeEmail` de `src/users/lib/normalize-email.ts`; `normalizeCpf` de `src/users/lib/normalize-cpf.ts` (Task 1).
- Produces:
  - `type RecipientLookup = { by: 'email'; value: string } | { by: 'cpf'; value: string }`
  - `resolveRecipientLookup(input: { email?: string | null; cpf?: string | null }): RecipientLookup | null` — email tem prioridade; normaliza o valor escolhido; retorna `null` quando nenhum dos dois vem preenchido.

- [ ] **Step 1: Write the failing test**

```ts
// src/tickets/lib/resolve-recipient-lookup.spec.ts
import { resolveRecipientLookup } from './resolve-recipient-lookup';

describe('resolveRecipientLookup', () => {
  it('usa email quando presente, normalizado', () => {
    expect(resolveRecipientLookup({ email: '  Maria@GMAIL.com ' })).toEqual({
      by: 'email',
      value: 'maria@gmail.com',
    });
  });

  it('usa cpf quando não há email, normalizado', () => {
    expect(resolveRecipientLookup({ cpf: '123.456.789-00' })).toEqual({
      by: 'cpf',
      value: '12345678900',
    });
  });

  it('email tem prioridade quando ambos vêm', () => {
    expect(
      resolveRecipientLookup({ email: 'a@b.co', cpf: '12345678900' }),
    ).toEqual({ by: 'email', value: 'a@b.co' });
  });

  it('retorna null quando nada é informado', () => {
    expect(resolveRecipientLookup({})).toBeNull();
    expect(resolveRecipientLookup({ email: '  ', cpf: '' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/tickets/lib/resolve-recipient-lookup.spec.ts`
Expected: FAIL — `Cannot find module './resolve-recipient-lookup'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tickets/lib/resolve-recipient-lookup.ts
import { normalizeEmail } from '../../users/lib/normalize-email';
import { normalizeCpf } from '../../users/lib/normalize-cpf';

export type RecipientLookup =
  | { by: 'email'; value: string }
  | { by: 'cpf'; value: string };

/**
 * Decide como buscar o destinatário da transferência. Email tem prioridade;
 * cai pra CPF quando não há email. Retorna null quando nenhum identificador
 * utilizável foi informado (o serviço transforma isso em 400).
 */
export function resolveRecipientLookup(input: {
  email?: string | null;
  cpf?: string | null;
}): RecipientLookup | null {
  const email = input.email?.trim();
  if (email) return { by: 'email', value: normalizeEmail(email) };

  const cpf = input.cpf ? normalizeCpf(input.cpf) : '';
  if (cpf) return { by: 'cpf', value: cpf };

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/tickets/lib/resolve-recipient-lookup.spec.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/tickets/lib/resolve-recipient-lookup.ts src/tickets/lib/resolve-recipient-lookup.spec.ts
git commit -m "feat(tickets): add resolveRecipientLookup helper"
```

---

### Task 3: `UsersService.findByCpf`

**Files:**
- Modify: `src/users/users.service.ts`

**Interfaces:**
- Consumes: `normalizeCpf` de `src/users/lib/normalize-cpf.ts` (Task 1); `User` repo já injetado.
- Produces: `UsersService.findByCpf(cpf: string): Promise<User | null>` — busca por CPF normalizado.

- [ ] **Step 1: Add the import**

No topo de `src/users/users.service.ts`, ao lado do import de `normalizeEmail`, adicione:

```ts
import { normalizeCpf } from './lib/normalize-cpf';
```

- [ ] **Step 2: Add the method**

Logo abaixo do método `findByEmail` (atual linha 24-26):

```ts
  findByCpf(cpf: string): Promise<User | null> {
    return this.repo.findOne({ where: { cpf: normalizeCpf(cpf) } });
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/users/users.service.ts
git commit -m "feat(users): add findByCpf lookup"
```

---

### Task 4: DTOs de request e response

**Files:**
- Create: `src/tickets/dto/transfer-ticket.dto.ts`
- Create: `src/tickets/dto/transfer-ticket.spec.ts`

**Interfaces:**
- Consumes: `normalizeCpf` de `src/users/lib/normalize-cpf.ts` (Task 1).
- Produces:
  - `class TransferTicketDto { email?: string; cpf?: string }` — exige pelo menos um; CPF normalizado no transform e validado como 11 dígitos.
  - `class TransferTicketResponse { id: string; shortCode: string; status: string; recipientEmail: string }` — retorno do endpoint (Task 5/6 consomem).

- [ ] **Step 1: Write the failing test**

```ts
// src/tickets/dto/transfer-ticket.spec.ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TransferTicketDto } from './transfer-ticket.dto';

function errorsFor(obj: Record<string, unknown>) {
  return validateSync(plainToInstance(TransferTicketDto, obj));
}

describe('TransferTicketDto', () => {
  it('aceita email sozinho', () => {
    expect(errorsFor({ email: 'maria@gmail.com' })).toHaveLength(0);
  });

  it('aceita CPF formatado sozinho (normaliza para 11 dígitos)', () => {
    const dto = plainToInstance(TransferTicketDto, { cpf: '123.456.789-00' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.cpf).toBe('12345678900');
  });

  it('rejeita quando nem email nem cpf vêm', () => {
    expect(errorsFor({}).length).toBeGreaterThan(0);
  });

  it('rejeita CPF com menos de 11 dígitos', () => {
    expect(errorsFor({ cpf: '123' }).length).toBeGreaterThan(0);
  });

  it('rejeita email inválido', () => {
    expect(errorsFor({ email: 'nao-eh-email' }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/tickets/dto/transfer-ticket.spec.ts`
Expected: FAIL — `Cannot find module './transfer-ticket.dto'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/tickets/dto/transfer-ticket.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, ValidateIf } from 'class-validator';
import { normalizeCpf } from '../../users/lib/normalize-cpf';

export class TransferTicketDto {
  @ApiPropertyOptional({
    example: 'destinatario@gmail.com',
    description: 'Email do destinatário. Obrigatório se cpf não for informado.',
  })
  @ValidateIf((o: TransferTicketDto) => !o.cpf)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '12345678900',
    description: 'CPF do destinatário (com ou sem máscara). Obrigatório se email não for informado.',
  })
  @ValidateIf((o: TransferTicketDto) => !o.email)
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeCpf(value) : value,
  )
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf?: string;
}

export class TransferTicketResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'ET-ABC123XYZ' }) shortCode: string;
  @ApiProperty({ example: 'VALID' }) status: string;
  @ApiProperty({ example: 'destinatario@gmail.com' }) recipientEmail: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/tickets/dto/transfer-ticket.spec.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/tickets/dto/transfer-ticket.dto.ts src/tickets/dto/transfer-ticket.spec.ts
git commit -m "feat(tickets): add transfer ticket DTOs"
```

---

### Task 5: `TicketsService.transfer` + controller + wiring do módulo

**Files:**
- Modify: `src/tickets/tickets.service.ts`
- Modify: `src/tickets/tickets.controller.ts`
- Modify: `src/tickets/tickets.module.ts`

**Interfaces:**
- Consumes: `resolveRecipientLookup` (Task 2), `UsersService.findByEmail`/`findByCpf` (Task 3), `TransferTicketDto`/`TransferTicketResponse` (Task 4), `EmailService.sendTicketByEmail`, `TicketStatus`.
- Produces: `TicketsService.transfer(senderUserId: string, ticketId: string, dto: TransferTicketDto): Promise<TransferTicketResponse>` e o endpoint `POST /tickets/:id/transfer`.

Observação: não há teste unitário aqui — importar `TicketsService` no Jest puxa a entidade `Ticket` → cuid2 ESM → quebra o runner (mesma razão documentada em `events.service.spec.ts`). As garantias testáveis vivem nas libs das Tasks 1, 2 e 4. A verificação desta task é `pnpm build` + `pnpm lint` + smoke manual.

- [ ] **Step 1: Reescrever o `TicketsService`**

Substitua o conteúdo de `src/tickets/tickets.service.ts` por (mantém `findShared` intacto, adiciona `transfer` + helper de QR):

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import * as QRCode from 'qrcode';
import { Ticket } from './entities/ticket.entity';
import { SharedTicketResponse } from './dto/shared-ticket.response';
import {
  TransferTicketDto,
  TransferTicketResponse,
} from './dto/transfer-ticket.dto';
import { resolveRecipientLookup } from './lib/resolve-recipient-lookup';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { User } from '../users/entities/user.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly emails: EmailService,
  ) {}

  async findShared(shortCode: string): Promise<SharedTicketResponse> {
    const code = shortCode.toUpperCase();

    const row = await this.tickets
      .createQueryBuilder('t')
      .leftJoin('events', 'e', 'e.id = t.eventId')
      .leftJoin('venues', 'v', 'v.id = e.venueId')
      .leftJoin('sectors', 's', 's.id = t.sectorId')
      .leftJoin('users', 'u', 'u.id = t.userId')
      .where('t.shortCode = :code', { code })
      .select([
        't.shortCode AS t_short',
        't.status AS t_status',
        't.holderName AS t_holder',
        'u.name AS u_name',
        'e.slug AS e_slug',
        'e.title AS e_title',
        'e.artist AS e_artist',
        'e.category AS e_category',
        'e.startsAt AS e_starts',
        'e.doorsAt AS e_doors',
        'e.posterUrl AS e_poster',
        'v.name AS v_name',
        'v.city AS v_city',
        'v.state AS v_state',
        's.name AS s_name',
        's.colorHex AS s_color',
      ])
      .getRawOne();

    if (!row) throw new NotFoundException('ticket not found');

    const fullName: string = row.t_holder ?? row.u_name ?? '';
    const holderFirstName = fullName.trim().split(/\s+/)[0] ?? '';

    return {
      shortCode: row.t_short,
      status: row.t_status,
      holderFirstName,
      event: {
        slug: row.e_slug,
        title: row.e_title,
        artist: row.e_artist,
        category: row.e_category,
        startsAt: new Date(row.e_starts).toISOString(),
        doorsAt: new Date(row.e_doors).toISOString(),
        posterUrl: row.e_poster,
        venueName: row.v_name,
        venueCity: row.v_city,
        venueState: row.v_state,
      },
      sector: {
        name: row.s_name,
        colorHex: row.s_color,
      },
    };
  }

  async transfer(
    senderUserId: string,
    ticketId: string,
    dto: TransferTicketDto,
  ): Promise<TransferTicketResponse> {
    const lookup = resolveRecipientLookup(dto);
    if (!lookup) {
      throw new BadRequestException('informe email ou cpf do destinatário');
    }

    const recipient =
      lookup.by === 'email'
        ? await this.users.findByEmail(lookup.value)
        : await this.users.findByCpf(lookup.value);
    if (!recipient) {
      throw new NotFoundException('destinatário não possui conta no sistema');
    }
    if (recipient.id === senderUserId) {
      throw new BadRequestException('não é possível transferir para si mesmo');
    }

    const newTicket = await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(Ticket);
      const original = await repo.findOne({ where: { id: ticketId } });
      if (!original) throw new NotFoundException('ticket not found');
      if (original.userId !== senderUserId) {
        throw new ForbiddenException('ticket does not belong to you');
      }
      if (original.status !== TicketStatus.VALID) {
        throw new BadRequestException(
          'apenas tickets válidos podem ser transferidos',
        );
      }

      original.status = TicketStatus.TRANSFERRED;
      original.transferredToUserId = recipient.id;

      const fresh = new Ticket();
      fresh.id = createId();
      fresh.shortCode = `ET-${createId().slice(0, 9).toUpperCase()}`;
      fresh.qrToken = `et:${original.orderId}:${createId()}`;
      fresh.orderId = original.orderId;
      fresh.userId = recipient.id;
      fresh.eventId = original.eventId;
      fresh.sectorId = original.sectorId;
      fresh.batchId = original.batchId;
      fresh.status = TicketStatus.VALID;
      fresh.holderName = recipient.name;
      fresh.holderEmail = recipient.email;

      await repo.save(original);
      await repo.save(fresh);
      return fresh;
    });

    await this.notifyRecipient(newTicket, recipient);

    return {
      id: newTicket.id,
      shortCode: newTicket.shortCode,
      status: newTicket.status,
      recipientEmail: recipient.email,
    };
  }

  // Best-effort: avisa o destinatário com o ticket novo. Nunca derruba a
  // transferência (que já foi commitada) se o email falhar.
  private async notifyRecipient(ticket: Ticket, recipient: User): Promise<void> {
    try {
      const event = await this.dataSource.getRepository(Event).findOne({
        where: { id: ticket.eventId },
        relations: { venue: true },
      });
      if (!event) return;
      const sector = await this.dataSource
        .getRepository(Sector)
        .findOne({ where: { id: ticket.sectorId } });

      await this.emails.sendTicketByEmail({
        to: recipient.email,
        buyerFirstName: recipient.name
          ? recipient.name.trim().split(/\s+/)[0]
          : null,
        eventTitle: event.title,
        eventArtist: event.artist,
        eventStartsAt: event.startsAt,
        venueName: event.venue?.name ?? '',
        venueCity: event.venue?.city ?? '',
        tickets: [
          {
            shortCode: ticket.shortCode,
            sectorName: sector?.name ?? '',
            qrPngBase64: await renderQrPngBase64(ticket.qrToken),
          },
        ],
      });
    } catch (err) {
      this.logger.warn(
        `transfer: email falhou para ${recipient.email}: ${(err as Error).message}`,
      );
    }
  }
}

async function renderQrPngBase64(text: string): Promise<string> {
  const buf = await QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#0A0A0F', light: '#FFFFFF' },
  });
  return buf.toString('base64');
}
```

Nota: confirme os caminhos `../events/entities/event.entity` e `../events/entities/sector.entity` — se os nomes de arquivo divergirem, ajuste os imports (use a busca do editor). Os campos usados (`event.title`, `event.artist`, `event.startsAt`, `event.venue`, `sector.name`) são os mesmos que `orders.service.ts` usa ao montar o email.

- [ ] **Step 2: Add the endpoint to the controller**

Substitua o conteúdo de `src/tickets/tickets.controller.ts` por:

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TicketsService } from './tickets.service';
import { SharedTicketResponse } from './dto/shared-ticket.response';
import {
  TransferTicketDto,
  TransferTicketResponse,
} from './dto/transfer-ticket.dto';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('share/:shortCode')
  @ApiOperation({
    summary:
      'Public lookup for a ticket by its shortCode. Returns event/sector info but NEVER the qrToken.',
  })
  @ApiResponse({ status: 200, type: SharedTicketResponse })
  share(@Param('shortCode') shortCode: string): Promise<SharedTicketResponse> {
    return this.tickets.findShared(shortCode);
  }

  @Post(':id/transfer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Transfere o ticket (do usuário logado) para outro usuário já cadastrado, por email ou CPF.',
  })
  @ApiResponse({ status: 201, type: TransferTicketResponse })
  transfer(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: TransferTicketDto,
  ): Promise<TransferTicketResponse> {
    return this.tickets.transfer(req.user.id, id, dto);
  }
}
```

- [ ] **Step 3: Wire the module**

Substitua o conteúdo de `src/tickets/tickets.module.ts` por (importa `UsersModule`; `EmailModule` é `@Global`, então `EmailService` já é injetável sem import):

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket]), UsersModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm build && pnpm lint`
Expected: build sem erros de tipo; lint limpo. Se o build reclamar do caminho de `Event`/`Sector`, corrija o import conforme o nome real do arquivo da entidade.

- [ ] **Step 5: Smoke manual (opcional, recomendado)**

Com `docker-compose up -d` e `pnpm start:dev`, autenticado como dono de um ticket VALID:

```bash
curl -X POST http://localhost:3000/api/v1/tickets/<ticketId>/transfer \
  -H "Authorization: Bearer <jwt>" -H "Content-Type: application/json" \
  -d '{"email":"<destinatario-cadastrado>@gmail.com"}'
```

Expected: 201 com `{ id, shortCode, status: "VALID", recipientEmail }`; o ticket original passa a `TRANSFERRED`; destinatário cadastrado inexistente → 404 "destinatário não possui conta no sistema".

- [ ] **Step 6: Commit**

```bash
git add src/tickets/tickets.service.ts src/tickets/tickets.controller.ts src/tickets/tickets.module.ts
git commit -m "feat(tickets): transfer a ticket to another registered user"
```

---

### Task 6: Esconder tickets `TRANSFERRED` da listagem padrão do dono

**Files:**
- Modify: `src/me/me.service.ts`

**Interfaces:**
- Consumes: `TicketStatus` de `src/common/enums/ticket-status.enum.ts`.
- Produces: comportamento — `GET /me/tickets` sem filtro de status não retorna `TRANSFERRED`; com `?status=TRANSFERRED` ainda retorna (histórico).

- [ ] **Step 1: Add the import**

No topo de `src/me/me.service.ts`, adicione:

```ts
import { TicketStatus } from '../common/enums/ticket-status.enum';
```

- [ ] **Step 2: Adjust the status filter in `listTickets`**

Em `listTickets`, troque o bloco atual:

```ts
    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
```

por:

```ts
    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    } else {
      // Na visão "todos" (sem filtro), escondemos tickets que o dono já
      // transferiu — eles continuam acessíveis filtrando por status=TRANSFERRED.
      qb.andWhere('t.status != :transferred', {
        transferred: TicketStatus.TRANSFERRED,
      });
    }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/me/me.service.ts
git commit -m "feat(me): hide transferred tickets from default ticket list"
```

---

## Self-Review

**Spec coverage:**
- Modelo invalidar+recriar (status TRANSFERRED + transferredToUserId + qrToken/shortCode novos) → Task 5. ✓
- Elegibilidade só VALID → Task 5 (guard no service). ✓
- Email best-effort ao destinatário → Task 5 (`notifyRecipient`). ✓
- Autorização: só o dono → Task 5 (guard JWT + `original.userId !== senderUserId`). ✓
- Identificador email OU CPF, email prioritário, CPF normalizado → Tasks 1, 2, 4. ✓
- Portador do novo ticket = destinatário → Task 5 (`holderName`/`holderEmail`). ✓
- Auto-transferência bloqueada → Task 5. ✓
- Destinatário sem conta → 404 → Task 5. ✓
- Sem migration → confirmado no header. ✓
- TRANSFERRED some da lista do dono mas fica em auditoria → Task 6. ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo tem código/comando concreto. ✓

**Type consistency:** `resolveRecipientLookup` retorna `{ by, value }` consumido igual na Task 5; `TransferTicketResponse` (id/shortCode/status/recipientEmail) idêntico entre Task 4 e o retorno da Task 5; `findByCpf`/`findByEmail` assinaturas batem. ✓
