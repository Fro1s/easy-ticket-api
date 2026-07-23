import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';

function makeConfig(vars: Record<string, string>): ConfigService {
  return { get: (k: string) => vars[k] } as unknown as ConfigService;
}

describe('WhatsAppService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('console driver logs and returns false (no send)', async () => {
    const svc = new WhatsAppService(makeConfig({}));
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const ok = await svc.sendText('5514996962007', 'oi');
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('zapi driver POSTs to Z-API with Client-Token header', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
    const svc = new WhatsAppService(
      makeConfig({
        WHATSAPP_PROVIDER: 'zapi',
        ZAPI_INSTANCE_ID: 'inst1',
        ZAPI_TOKEN: 'tok1',
        ZAPI_CLIENT_TOKEN: 'ct1',
      }),
    );
    const ok = await svc.sendText('5514996962007', 'olá');
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.z-api.io/instances/inst1/token/tok1/send-text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Client-Token': 'ct1' }),
        body: JSON.stringify({ phone: '5514996962007', message: 'olá' }),
      }),
    );
  });

  it('zapi driver returns false on non-2xx without throwing', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('unauthorized'),
    } as unknown as Response);
    const svc = new WhatsAppService(
      makeConfig({
        WHATSAPP_PROVIDER: 'zapi',
        ZAPI_INSTANCE_ID: 'inst1',
        ZAPI_TOKEN: 'tok1',
      }),
    );
    await expect(svc.sendText('5514996962007', 'x')).resolves.toBe(false);
  });
});
