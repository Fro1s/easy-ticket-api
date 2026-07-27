# Teste de carga — abertura de venda

Mede se a infra aguenta ~100 compradores simultâneos, **sem tocar em produção**.

## Por que não rodar contra produção

- `POST /orders` reserva estoque de verdade por **10 minutos** (`RESERVATION_TTL_MS`).
  100 pedidos de teste travariam o lote inteiro na véspera da venda.
- Dispara e-mail pelo Resend (queima cota e mancha a reputação do domínio) e abre
  cobrança PIX no AbacatePay.
- Deixa lixo no banco de produção que alguém tem que limpar depois.

O alvo é sempre um **clone descartável**: branch do Neon + app Fly separada.

---

## 1. Criar o ambiente clone

**Banco** — no console do Neon: Branches → New branch, a partir de `production`.
Você tem 10 branches no plano free e usa 1. Copie a connection string da branch
(use o endpoint com `-pooler`, igual à de produção).

**API** — uma segunda app Fly com o **mesmo** `[[vm]]` do `fly.toml`, senão o
número medido não vale para produção:

```bash
fly apps create easy-ticket-api-loadtest
fly secrets set -a easy-ticket-api-loadtest \
  DATABASE_URL="<connection string da BRANCH, não a de produção>" \
  JWT_SECRET="<qualquer segredo forte, só para o teste>" \
  JWT_REFRESH_SECRET="<idem>" \
  QR_SECRET="<idem>" \
  ABACATEPAY_WEBHOOK_SECRET="<idem>" \
  NODE_ENV=production
fly deploy -a easy-ticket-api-loadtest
```

> O `assertProductionSecrets()` em `main.ts` recusa subir com segredo fraco ou
> placeholder, então gere valores de verdade: `openssl rand -base64 48`.

## 2. Gerar os compradores e os tokens

`POST /auth/login` é limitado a **5 req/min por IP**, então 100 threads não
conseguem logar — 95 tomariam 429 e o teste mediria o throttler de auth em vez
do checkout. Os tokens são assinados localmente:

```bash
cd api
export DATABASE_URL="<connection string da BRANCH>"
export JWT_SECRET="<o mesmo JWT_SECRET da app de teste>"
export LOADTEST_I_KNOW_THIS_IS_NOT_PROD=yes
pnpm loadtest:seed
```

Gera `tokens.csv` com 100 tokens válidos por 4h. **O arquivo está no
`.gitignore` — são JWTs válidos, não commite e não compartilhe.**

Ajuste a quantidade com `LOADTEST_USERS=250`.

## 3. Aquecer antes de medir

Sem isso o primeiro número sai contaminado por cold start do Fly + wake do Neon,
e você mede a partida, não a capacidade:

```bash
pnpm loadtest:prewarm -- --host easy-ticket-api-loadtest.fly.dev --seconds 120
```

## 4. Rodar

Sempre em modo CLI (a GUI do JMeter consome CPU e distorce o resultado):

```bash
cd api/scripts/loadtest
jmeter -n -t onsale.jmx \
  -Jhost=easy-ticket-api-loadtest.fly.dev \
  -Jslug=<slug-do-evento-de-teste> \
  -Jusers=100 \
  -Jramp=2 \
  -l results/run1.jtl \
  -e -o results/run1-html
```

Abra `results/run1-html/index.html` para o relatório.

O evento precisa existir na branch com estoque suficiente. Se o lote tiver menos
de 100 ingressos, parte dos `POST /orders` volta 409 — o que é **correto**, não é
falha (o plano aceita 201 e 409).

---

## Como ler o resultado

| Sinal | Significado |
|---|---|
| `429` em qualquer sampler | Throttler batendo. Se aparecer, o teste está medindo o rate limiter — revise os tokens |
| `500` / `503` | Falha real. É o que você quer que apareça **aqui** e não amanhã |
| `POST /orders` p95 subindo muito | Contenção no estoque ou pool saturado |
| Erro de timeout do pool | `DATABASE_POOL_MAX` (50) insuficiente, ou Neon não escalou |
| `409` no `POST /orders` | Lote esgotou. Esperado se o estoque é menor que o número de threads |

Vale acompanhar em paralelo:

```bash
fly logs -a easy-ticket-api-loadtest
fly status -a easy-ticket-api-loadtest   # memória: se encostar em 1GB, é OOM a caminho
```

E no console do Neon → Monitoring: se `ALLOCATED CU` ficou preso em 0.25 durante
o burst, o autoscaler não subiu a tempo — ver a seção seguinte.

## Critérios de aprovação

- Zero 5xx
- Zero 429
- Zero oversell (soma dos pedidos ≤ estoque do lote)
- Memória sem encostar no teto
- p95 do `POST /orders` num valor que você aceite como experiência de compra

---

## Pré-escalar o Neon para o dia da venda

O compute está em `.25 ↔ 2 CU` com autoscaling. Acordar (`SELECT 1`) **não é o
mesmo que escalar**: um compute acordado mas ocioso continua em 0.25 CU, e o
autoscaler leva tempo para subir — justamente nos primeiros segundos da abertura.

**Forma preferida:** no console do Neon, Branches → `production` → editar o
compute e subir o **mínimo** do autoscaling de 0.25 para 1 CU, na janela da
venda. É determinístico. Custo: 1 CU-hora por hora, contra as ~95 CU-horas livres
que você tem no ciclo — na prática, zero.

**Se o plano não deixar mexer no mínimo:** rode o `prewarm.mjs` contra produção
começando ~10 min antes da abertura. Ele segura carga de leitura leve, o que dá
ao autoscaler motivo para subir antes dos compradores chegarem:

```bash
pnpm loadtest:prewarm -- --host easy-ticket-api.fly.dev --seconds 900 --slug <slug-real>
```

Lembre de **voltar o mínimo para 0.25** depois da venda, senão o compute fica
grande 24/7 e aí sim consome a cota do mês.

## Depois da venda

- Reverter `min_machines_running` para 0 e `memory_mb` para 512 no `fly.toml`
- Voltar o mínimo do autoscaling do Neon para 0.25
- `fly apps destroy easy-ticket-api-loadtest`
- Deletar a branch de teste no Neon
- Apagar o `tokens.csv`
