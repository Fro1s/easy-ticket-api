# Deploy — Google Wallet + Apple Wallet

Passo a passo para ligar os passes de ingresso em produção. As duas features
nascem **desligadas**: sem as variáveis abaixo, os endpoints respondem
`503 apple/google wallet not configured` e os botões não aparecem no front.

Há **dois lados**: o backend (Fly.io) precisa das credenciais; o frontend
(Vercel) precisa de duas flags públicas, senão os botões nunca renderizam.

> Comandos `fly` rodam na sua máquina com o `flyctl` autenticado.
> App da API no Fly: `easy-ticket-api`.

---

## Como o código consome cada credencial (contexto)

Ler isto evita 90% dos erros de formato:

- **Google** — `google-wallet.service.ts` faz `Buffer.from(GOOGLE_WALLET_SA_KEY_BASE64, 'base64').toString('utf8')`
  e assina um JWT RS256 `savetowallet`. Ou seja, essa var é a **chave privada
  PEM inteira, em base64**. O `origins` do JWT vem de `WEB_BASE_URL` — se
  estiver errado, o Google recusa o "Salvar".
- **Apple** — `apple-wallet.service.ts` lê os 3 certificados como
  `Buffer.from(<b64>, 'base64')` (PEM em base64) e monta o `.pkpass` a partir
  de `assets/easyticket.pass/`. `passTypeIdentifier` e `teamIdentifier` vêm do
  **env** e sobrescrevem os placeholders do `pass.json` — só os **ícones**
  daquele diretório precisam ser trocados por arte real.

---

## 1. Google Wallet

### 1.1 Emissor (Google Pay & Wallet Console)
1. Acesse https://pay.google.com/business/console e registre-se como emissor.
2. Anote o **Issuer ID** (número ~16 dígitos) → `GOOGLE_WALLET_ISSUER_ID`.
3. Em produção, para o pass sair de `UNDER_REVIEW`, solicite a publicação do
   emissor pelo console (o código já cria a classe como `UNDER_REVIEW`; passes
   funcionam para a própria conta enquanto isso).

### 1.2 Service account (Google Cloud)
1. https://console.cloud.google.com → crie/selecione um projeto.
2. **APIs & Services → Enable APIs** → habilite **Google Wallet API**.
3. **IAM & Admin → Service Accounts** → crie uma service account.
   - Anote o e-mail dela (`...@...iam.gserviceaccount.com`) → `GOOGLE_WALLET_SA_EMAIL`.
4. Na service account → **Keys → Add key → JSON** → baixe o arquivo.
5. No **Google Pay & Wallet Console → Users**, dê acesso a essa service
   account no emissor (senão o JWT assinado é rejeitado).

### 1.3 Extrair a chave privada e converter para base64
O JSON baixado tem um campo `private_key` (um PEM `-----BEGIN PRIVATE KEY-----`).
O código espera **esse PEM** em base64, não o JSON inteiro:

```bash
# extrai o campo private_key do JSON e o codifica em base64 (linha única)
jq -r '.private_key' sa-key.json | base64 -w0
```
O resultado é o valor de `GOOGLE_WALLET_SA_KEY_BASE64`.

> Sem `jq`: abra o JSON, copie o valor de `private_key` (com os `\n` resolvidos
> em quebras reais) para um arquivo `key.pem` e rode `base64 -w0 key.pem`.

### 1.4 Configurar no Fly
```bash
fly secrets set \
  GOOGLE_WALLET_ISSUER_ID=3388000000022222222 \
  GOOGLE_WALLET_SA_EMAIL=easy-wallet@projeto.iam.gserviceaccount.com \
  GOOGLE_WALLET_SA_KEY_BASE64="$(jq -r '.private_key' sa-key.json | base64 -w0)" \
  -a easy-ticket-api
```
Isso dispara um redeploy. **Apague o `sa-key.json` local depois.**

---

## 2. Apple Wallet

Exige conta paga no **Apple Developer Program** (US$ 99/ano).

### 2.1 Pass Type ID + certificado de assinatura
1. https://developer.apple.com/account → **Certificates, IDs & Profiles**.
2. **Identifiers → +** → **Pass Type IDs** → crie
   `pass.com.seudominio.ingresso`.
   - Esse identifier → `APPLE_PASS_TYPE_ID`.
3. Ainda no Pass Type ID, gere um **certificado**:
   - No Mac (Acesso às Chaves → Assistente de Certificação) gere um **CSR**.
   - Suba o CSR no portal, baixe o `.cer` gerado.
4. O **Team ID** está no topo direito da conta (10 caracteres) → `APPLE_TEAM_ID`.

### 2.2 Certificado WWDR
Baixe o **Apple Worldwide Developer Relations (WWDR)** — o "G4" atual:
https://www.apple.com/certificateauthority/ (arquivo `AppleWWDRCAG4.cer`).

### 2.3 Converter os três para PEM e depois base64
O código quer **PEM em base64** para cada um.

```bash
# 1) Certificado de assinatura (.cer → PEM)
openssl x509 -inform der -in pass.cer -out signerCert.pem

# 2) Chave privada: exporte do Acesso às Chaves como .p12 (o par do CSR),
#    depois extraia a chave. Se puser senha no .p12, ela vira APPLE_PASS_KEY_PASSPHRASE.
openssl pkcs12 -in pass.p12 -nocerts -out signerKey.pem   # pede a senha do .p12

# 3) WWDR (.cer → PEM)
openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem

# base64 de cada um (linha única)
base64 -w0 signerCert.pem   # → APPLE_PASS_CERT_BASE64
base64 -w0 signerKey.pem    # → APPLE_PASS_KEY_BASE64
base64 -w0 wwdr.pem         # → APPLE_WWDR_CERT_BASE64
```

### 2.4 Ícones reais (obrigatório antes de usar)
Os arquivos em `api/assets/easyticket.pass/` são **placeholders 1×1 pretos**
(gerados por `scripts/make-pass-icons.js`). Sem arte real o passe sai com
ícone falso. Substitua, mantendo os nomes e tamanhos:

| Arquivo | Tamanho |
|---|---|
| `icon.png` | 29×29 |
| `icon@2x.png` | 58×58 |
| `logo.png` | até 160×50 |

Commite os PNGs — eles vão versionados e o Dockerfile copia
`/app/assets` para a imagem.

### 2.5 Configurar no Fly
```bash
fly secrets set \
  APPLE_PASS_TYPE_ID=pass.com.seudominio.ingresso \
  APPLE_TEAM_ID=ABCDE12345 \
  APPLE_PASS_CERT_BASE64="$(base64 -w0 signerCert.pem)" \
  APPLE_PASS_KEY_BASE64="$(base64 -w0 signerKey.pem)" \
  APPLE_WWDR_CERT_BASE64="$(base64 -w0 wwdr.pem)" \
  APPLE_PASS_KEY_PASSPHRASE="senha-do-p12-se-houver" \
  -a easy-ticket-api
```
Omita `APPLE_PASS_KEY_PASSPHRASE` se a chave não tiver senha.
**Apague os `.pem`/`.p12` locais depois.**

---

## 3. Frontend (Vercel) — senão os botões não aparecem

O gating do front é **independente** do backend (`web/src/lib/wallet.ts`):

```
NEXT_PUBLIC_WALLET_GOOGLE=1
NEXT_PUBLIC_WALLET_APPLE=1
```
1. Vercel → projeto do web → **Settings → Environment Variables** →
   adicione as duas em **Production**.
2. **Redeploy** o web (variável `NEXT_PUBLIC_*` é embutida no build).

> Confirme também que `WEB_BASE_URL` (no Fly) é o domínio real de produção —
> ele vira o `origins` do JWT do Google. Errado = "Save" recusado.

---

## 4. Testar (E2E, antes de considerar pronto)

1. Compre/pague um ingresso de teste em produção.
2. Abra `/meus-ingressos/<id>`.
3. **Google:** clique "Adicionar ao Google Wallet" → abre `pay.google.com/gp/v/save/...`
   → o pass deve salvar no app Google Wallet (Android).
4. **Apple:** clique "Apple Wallet" → baixa `<shortCode>.pkpass` → abrir num
   iPhone/Safari deve oferecer "Adicionar à Carteira".
5. Escaneie o QR do pass na **portaria** → deve validar como o QR do app.

Falha comum: pass abre mas dá erro de assinatura → quase sempre cadeia de
certificado Apple incompleta (WWDR errado/desatualizado) ou base64 com quebra
de linha (use sempre `base64 -w0`).

---

## Resumo das variáveis

| Var (Fly / API) | Origem |
|---|---|
| `GOOGLE_WALLET_ISSUER_ID` | Google Pay & Wallet Console |
| `GOOGLE_WALLET_SA_EMAIL` | service account (Google Cloud) |
| `GOOGLE_WALLET_SA_KEY_BASE64` | `private_key` do JSON da SA, em base64 |
| `APPLE_PASS_TYPE_ID` | Pass Type ID (Apple Developer) |
| `APPLE_TEAM_ID` | Team ID (Apple Developer) |
| `APPLE_PASS_CERT_BASE64` | cert de assinatura PEM, em base64 |
| `APPLE_PASS_KEY_BASE64` | chave privada PEM, em base64 |
| `APPLE_WWDR_CERT_BASE64` | WWDR PEM, em base64 |
| `APPLE_PASS_KEY_PASSPHRASE` | senha do .p12 (se houver) |

| Var (Vercel / web) | Valor |
|---|---|
| `NEXT_PUBLIC_WALLET_GOOGLE` | `1` |
| `NEXT_PUBLIC_WALLET_APPLE` | `1` |
