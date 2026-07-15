# Escalando para 100 compras simultâneas

**Escopo:** garantir que a compra de ingressos aguente ao menos **100 compradores
concorrentes do mesmo evento** (o pior caso de contenção), sem overselling e com
latência aceitável. Documenta o diagnóstico, as correções, a prova por load test
e as recomendações de produção.

**Branch:** `fix/scale-and-security` · **TL;DR:** de **~82–96% de falha** sob
carga para **100% de sucesso**, p95 ~5s, **zero oversell**.

---

## 1. Por que a compra contende

O fluxo de compra tem 3 passos, cada um uma request HTTP:

1. `POST /orders` — **cria** o pedido e **reserva** estoque (`batch.reserved += qty`).
2. `POST /orders/:id/checkout` — escolhe método e cria a sessão de pagamento.
3. Confirmação (`POST /payments/webhook` em prod; `simulate-payment` em dev) —
   **baixa** o estoque (`reserved → sold`), emite ingressos, marca `PAID`.

O estoque de um lote (`batches.sold`, `batches.reserved`) é **uma única linha**.
Para impedir overselling, todos os compradores daquele lote precisam ser
**serializados** no ponto em que mexem nessa linha. O problema não é a
serialização em si (é inevitável e correta) — é **quanto tempo** cada comprador
segura o recurso contencioso (lock de linha e/ou conexão do pool).

---

## 2. Diagnóstico

A investigação combinou uma auditoria multi-agente (adversarialmente
verificada), leitura de código e — decisivamente — **load test com medição**.
Os gargalos encontrados, em ordem de impacto:

### 2.1 I/O externo dentro da transação segurando locks
`markOrderPaid` rodava **dentro** de uma transação que segurava
`pessimistic_write` nas linhas de Sector/Batch, e ali dentro fazia:
- envio de **email** (chamada HTTP ao Resend), e
- **renderização de QR PNG**.

Ou seja: cada confirmação segurava o lock do estoque **durante uma ida à rede**.
Todos os compradores do evento serializavam atrás desse I/O.

### 2.2 Pool de conexões não dimensionado
Sem config explícita, o `node-postgres` usa **máx. 10 conexões**. A compra
segura uma conexão pela transação inteira → sob rajada, a 11ª+ request
enfileira indefinidamente.

### 2.3 Deadlock webhook ↔ cron de expiração
O webhook travava `Order → Sector → Batch`; o cron de expiração travava
`Sector → Batch → Order`. Ordem inversa de aquisição → **deadlock** do Postgres,
que vira 500 para o gateway.

### 2.4 Índices ausentes
As queries quentes (busca de pedido, página do evento, dedup anti-flood, cron de
expiração) batiam em colunas de FK/filtro **sem índice** → sequential scans sob
carga.

### 2.5 (achado pelo load test) Deadlock de connection pool no `serialize()`
`serialize()` era chamado **dentro** da transação, mas consultava os lotes pelo
**DataSource default** — pegando uma **segunda** conexão do pool enquanto a
transação ainda segurava a primeira. Com N compras concorrentes, quando
`N > pool/2` **todas** as conexões ficam presas, cada uma esperando uma 2ª que
nunca libera → o pool trava por completo. No log aparecia como
`timeout exceeded when trying to connect` (sem nenhum deadlock de banco — por
isso confundia).

### 2.6 (achado pelo load test) Seção crítica longa no `create()` / `markOrderPaid`
Mesmo sem o I/O externo, ambos seguravam `SELECT ... FOR UPDATE` e faziam
múltiplas idas ao banco (ler, resolver, salvar, inserir) **com o lock segurado**
até o commit. O lock de linha ficava retido muito além do necessário.

> **Corretude nunca esteve em risco:** em todos os testes, sob qualquer
> concorrência, **não houve oversell** — a prevenção sempre funcionou. O que
> estava ruim era o **throughput/disponibilidade** sob rajada.

---

## 3. As correções

### 3.1 Índices hot-path + pool dimensionado
Migration `1778800000000-HotPathIndexes` + `@Index` nas entidades:
- `orders (userId, status, reservedUntil)` e `orders (status, reservedUntil)`
- `order_items (orderId)`, `sectors (eventId)`, `tickets (eventId, status)`

Pool explícito em `data-source.ts` (env-overridable):
```ts
extra: {
  max: 50,                       // sob o max_connections=100 do Postgres
  connectionTimeoutMillis: 15000, // rajada ENFILEIRA no lock, não falha na hora
  idleTimeoutMillis: 30000,
}
```

### 3.2 Email/QR/SSE movidos para pós-commit
`markOrderPaid` não envia mais email nem notifica dentro da transação. Os
chamadores de alta concorrência passam `deferSideEffects`, e os efeitos
(`stream.notify` + `distributeTicketEmails`) rodam **depois** que a transação
comita e **libera os locks**. Um email/QR que falhe nunca desfaz a venda
(`runPaidSideEffects` captura erros).

### 3.3 Ordem de lock única (fim do deadlock)
O webhook (`markPaidByPaymentId`) **não trava mais o Order** com `FOR UPDATE`. O
único ponto de serialização passou a ser o **claim atômico** do status do pedido
(ver 3.4), eliminando a inversão de ordem contra o cron.

### 3.4 Operações atômicas de estoque (o cerne)
Em vez de `FOR UPDATE` + read-modify-write, a mutação contenciosa virou um
**UPDATE condicional atômico** — a cláusula `WHERE` **é** a checagem anti-oversell
—, feito como a última operação da transação e com ids ordenados (ordem de lock
estável):

**Reserva (`create`):**
```sql
UPDATE batches SET reserved = reserved + :qty
 WHERE id = :id AND capacity - sold - reserved >= :qty;   -- affected=0 ⇒ esgotado
```

**Confirmação (`markOrderPaid`)** — claim do pedido + baixa de estoque:
```sql
-- exatamente um vencedor entre confirmações concorrentes do mesmo pedido
UPDATE orders SET status='PAID', "paidAt"=now
 WHERE id = :id AND status = 'PENDING';                   -- affected=0 ⇒ idempotente

-- só o vencedor baixa o estoque
UPDATE batches SET sold = sold + :qty,
                   reserved = GREATEST(0, reserved - :qty)
 WHERE id = :id;
```

Assim o lock de linha é segurado por **microssegundos** (só o UPDATE + commit), e
a idempotência do webhook passa a ser garantida pelo próprio claim atômico
(dois webhooks para o mesmo pagamento → um faz `affected=1`, o outro `affected=0`
e retorna os ingressos existentes, sem emissão dupla).

### 3.5 `serialize()` reusa a conexão da transação
```ts
private async serialize(order, event, sectors, mgr?: EntityManager) {
  const reader = mgr ?? this.dataSource;   // dentro da tx: reusa; fora: pool normal
  const batches = await reader.getRepository(Batch).find({ where: { id: In(batchIds) } });
  ...
}
```
Elimina a segunda conexão por request — a causa do travamento total do pool.

---

## 4. Garantia de corretude (por que não há oversell)

- A reserva só acontece se `capacity - sold - reserved >= qty` **na mesma
  instrução** que incrementa `reserved`; o lock de linha do Postgres serializa
  os UPDATEs concorrentes, então a checagem é sempre contra o valor atual.
- A confirmação só baixa estoque se o claim `WHERE status='PENDING'` vencer —
  garantindo emissão de ingressos **uma única vez** por pedido.
- Verificado no load test: `sold` subiu **exatamente** o número de compras
  bem-sucedidas, e `sold + reserved ≤ capacity` sempre.

---

## 5. O load test

**Ferramentas:** `k6` (imagem `grafana/k6` via Docker, atingindo a API do host por
`host.docker.internal`) **e** um gerador host-side em Node (contra `localhost`,
para descartar a rede do Docker como variável).

**Setup** (`lt-setup.js`): semeia 100 usuários e **emite JWTs direto** (HS256 com
o `JWT_SECRET` de dev, via `crypto`) — a forma correta de load-testar uma API
autenticada sem esbarrar no rate-limit de login/registro (que é por IP e o
gerador sai de um IP só). Prepara o evento demo com estoque (capacidade 1000) e
chave PIX. **Teardown** (`lt-teardown.js`) remove tudo e restaura o evento.

**Cenário:** 100 VUs concorrentes, cada um o fluxo completo
`create → checkout → simulate-payment`, **todos no mesmo evento/lote** (contenção
máxima), 3 rodadas = 300 compras, pico de 100 simultâneas.

---

## 6. Resultados

| Métrica | Antes | Depois |
|---|---|---|
| Sucesso (300 compras) | ~7–45% | **100%** (k6: 1800/1800 checks) |
| Falhas | 82–96% (`pool timeout`) | **0** |
| p95 da compra completa | ~55s | **~5s** |
| p95 por request HTTP | — | ~2,5s |
| Throughput | — | ~29 compras/s (~89 req/s) |
| Oversell | nunca | **nunca** (`sold` +300 exato) |

Benchmark do banco local: ~**515 baixas de estoque/s** sequenciais
(1,94 ms/commit) — confirma que o Postgres não era o gargalo; os gargalos eram
os itens da seção 2.

---

## 7. Ressalvas e recomendações de produção

- **Ambiente do teste:** rodou localmente contra Postgres em Docker. Em produção
  (Fly.io + Postgres gerenciado/SSD) o desempenho tende a ser **igual ou melhor**.
  Recomenda-se um run contra **staging** para o número oficial.
- **Teto de throughput por lote:** a serialização no lote quente é inerente
  (~500 baixas/s local). Para volumes muito acima disso, o caminho é distribuir o
  estoque (ex.: sub-lotes) — fora do escopo atual.
- **Infra Fly.io:** deixada como **recomendação comentada** em `fly.toml`
  (`min_machines_running=1`, `memory_mb=1024`) por ter impacto de custo. Os
  fixes de código fazem o trabalho pesado; suba a máquina só se houver pressão de
  memória.
- **Email em escala:** hoje o email/QR roda pós-commit (não bloqueia a venda),
  mas sob rajada o provedor (Resend) responde 429. O próximo passo natural é uma
  **fila** (o Redis já está provisionado) — os erros hoje são capturados e não
  afetam a compra.
- **Redis:** ainda usado só como cache em memória de sessão de pagamento (com TTL
  agora). Necessário migrar para o Redis compartilhado **antes** de rodar >1
  máquina.

---

## 8. Referência

- **Branch:** `fix/scale-and-security`
- **Commits principais:**
  - `perf(db): size pg pool + add hot-path indexes`
  - `perf(orders): run email/QR/SSE after commit + fix confirm-path deadlock`
  - `perf(orders): atomic stock ops + reuse tx connection in serialize`
  - (segurança, no mesmo branch: guard de segredos, PIX-lock, webhook, throttle)
- **Arquivos-chave:** `src/orders/orders.service.ts`,
  `src/common/database/data-source.ts`,
  `src/migrations/1778800000000-HotPathIndexes.ts`
- **Verificação:** `pnpm build` + `pnpm test` (113/113) + load test (k6 e
  host-side) + checagem de oversell no banco.
