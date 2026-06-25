# Transferência de Ticket — Design

**Data:** 2026-06-25
**Status:** Aprovado (aguardando revisão do spec)

## Objetivo

Permitir que o **dono** de um ticket o transfira para outro usuário **já cadastrado**
no sistema, identificado por **email ou CPF**. O ticket original é invalidado e um
ticket novo é gerado para o destinatário.

## Decisões-chave

- **Modelo da transferência:** invalidar + recriar. O ticket original recebe status
  `TRANSFERRED` e `transferredToUserId`; um **novo** ticket (com `qrToken` e `shortCode`
  novos) é criado para o destinatário. Motivo: o QR antigo (possível print do remetente)
  deixa de funcionar na portaria — a validação em `producer.service.ts` já rejeita
  qualquer ticket com status `!== VALID`, então nenhuma mudança na portaria é necessária.
- **Elegibilidade:** apenas tickets `VALID`. Bloqueia `USED`, `REFUNDED`, `TRANSFERRED`.
- **Notificação:** envia email ao destinatário (best-effort, reaproveitando `EmailModule`).
- **Autorização:** apenas o dono atual do ticket (endpoint autenticado, `ticket.userId == req.user.id`).
- **Identificador:** email **ou** CPF (pelo menos um). Email tem prioridade. CPF normalizado para 11 dígitos.
- **Portador do novo ticket:** `holderName`/`holderEmail` preenchidos com nome/email do destinatário.
- **Auto-transferência:** bloqueada.
- **Migration:** nenhuma. Os campos (`transferredToUserId`, status `TRANSFERRED`) já existem no schema.

## Componentes

### 1. DTO — `TransferTicketDto`
Arquivo: `src/tickets/dto/transfer-ticket.dto.ts`
- `email?: string` — `@IsEmail`, opcional.
- `cpf?: string` — opcional; normalizado e validado como 11 dígitos.
- Validação garantindo **pelo menos um** dos dois preenchido.

### 2. Lib — `normalizeCpf`
Arquivo: `src/users/lib/normalize-cpf.ts` (+ `.spec.ts`)
- Remove tudo que não é dígito; valida 11 dígitos. Espelha `normalize-email.ts`.

### 3. `UsersService.findByCpf(cpf)`
Novo método, simétrico a `findByEmail`, usando `normalizeCpf`.

### 4. `TicketsService.transfer(senderUserId, ticketId, dto)`
Dentro de `dataSource.transaction`:
1. Carrega o ticket; inexistente → `NotFoundException`.
2. `ticket.userId !== senderUserId` → `ForbiddenException`.
3. `ticket.status !== VALID` → `BadRequestException` ("apenas tickets válidos podem ser transferidos").
4. Resolve destinatário: email → `findByEmail`; senão `findByCpf`. Não encontrado →
   `NotFoundException` ("destinatário não possui conta no sistema").
5. Destinatário == remetente → `BadRequestException` ("não é possível transferir para si mesmo").
6. Marca original: `status = TRANSFERRED`, `transferredToUserId = recipient.id`.
7. Cria ticket novo: novo `id`, `shortCode` (`ET-...`), `qrToken` (`et:{orderId}:{cuid}`);
   mesmos `orderId/eventId/sectorId/batchId`; `userId = recipient.id`; `status = VALID`;
   `holderName/holderEmail` = nome/email do destinatário.
8. Salva ambos na mesma transação.
9. **Fora da transação** (best-effort): envia email ao destinatário via `EmailModule`.

Retorna DTO com o ticket novo (id, shortCode, status).

### 5. Controller — `POST /tickets/:id/transfer`
Em `TicketsController`, com `@UseGuards(JwtAuthGuard)` + `@ApiBearerAuth()`, lendo
`req.user.id` como remetente (mesmo padrão do `MeController`).

### 6. Módulo — `TicketsModule`
`forFeature([Ticket])` + importar `UsersModule` e `EmailModule`. Injetar `DataSource`.

### 7. Ajuste no `/me/tickets`
Em `me.service.ts`, na listagem default (sem filtro de status), **esconder `TRANSFERRED`**
seguindo o mesmo padrão de `hideStatuses` de `producer-events.service.ts`. Filtrando
explicitamente por `status=TRANSFERRED`, o ticket ainda aparece (histórico/auditoria).

## Tratamento de erros

| Situação | Resposta |
|---|---|
| Ticket inexistente ou de outro dono | 404 / 403 |
| Ticket não-VALID (usado/reembolsado/já transferido) | 400 |
| Nem email nem CPF informado | 400 (validação DTO) |
| Destinatário sem conta | 404 "destinatário não possui conta" |
| Transferir para si mesmo | 400 |

## Testes

- Unit em `TicketsService.transfer`: happy path (email e CPF), destinatário inexistente,
  ticket não-VALID, ticket de outro dono, self-transfer, e verificação de que
  `qrToken`/`shortCode` do novo ticket diferem do original.
- Unit em `normalizeCpf`.
