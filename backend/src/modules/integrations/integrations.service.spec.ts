import { PrismaService } from '../../common/prisma/prisma.service';
import { IntegrationsService } from './integrations.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let stored: any;

  const prisma = {
    integrationApiKey: {
      create: jest.fn(async ({ data }) => {
        stored = {
          id: 'integration-1',
          ...data,
          status: 'ACTIVE',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
        };
        return stored;
      }),
      findUnique: jest.fn(async ({ where }) => {
        if (where.id) return stored?.id === where.id ? stored : null;
        if (where.keyPrefix) return stored?.keyPrefix === where.keyPrefix ? stored : null;
        return null;
      }),
      update: jest.fn(async ({ data }) => {
        stored = { ...stored, ...data, updatedAt: new Date() };
        return stored;
      }),
      updateMany: jest.fn(async ({ data }) => {
        if (data.scopes?.push) {
          stored = { ...stored, scopes: [...stored.scopes, data.scopes.push] };
        } else {
          stored = { ...stored, ...data };
        }
        return { count: 1 };
      }),
      findMany: jest.fn(async () => (stored ? [stored] : [])),
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = undefined;
    service = new IntegrationsService(prisma);
  });

  it('gera segredo forte e persiste somente hash + prefixo público', async () => {
    const created = await service.create(
      { name: 'MsgDesk', scopes: ['charges:create'] },
      'admin-1',
    );

    expect(created.secretKey).toMatch(/^canfy_sk_[A-Za-z0-9_-]{11}_[A-Za-z0-9_-]{43}$/);
    expect(stored.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.keyHash).not.toBe(created.secretKey);
    expect(JSON.stringify(stored)).not.toContain(created.secretKey);
  });

  it('autentica chave válida e atualiza lastUsedAt', async () => {
    const created = await service.create(
      { name: 'MsgDesk', scopes: ['charges:create', 'charges:read'] },
      'admin-1',
    );

    const authenticated = await service.authenticate(created.secretKey);

    expect(authenticated.id).toBe('integration-1');
    expect(authenticated.scopes).toContain('charges:create');
    expect(prisma.integrationApiKey.updateMany).toHaveBeenCalled();
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
  });

  it('rejeita chave inválida ou revogada com erro genérico', async () => {
    const created = await service.create(
      { name: 'MsgDesk', scopes: ['charges:create'] },
      'admin-1',
    );

    await expect(service.authenticate(created.secretKey + 'x')).rejects.toThrow(
      'Credencial de integração inválida',
    );

    await service.revoke('integration-1');
    await expect(service.authenticate(created.secretKey)).rejects.toThrow(
      'Credencial de integração inválida',
    );
  });

  it('habilita catalog:read na mesma chave, sem alterar segredo ou outras permissões', async () => {
    const created = await service.create(
      { name: 'MsgDesk', scopes: ['charges:create', 'products:read'] },
      'admin-1',
    );
    const keyHash = stored.keyHash;
    const keyPrefix = stored.keyPrefix;

    const updated = await service.enableCatalogRead('integration-1');

    expect(updated.scopes).toEqual(['charges:create', 'products:read', 'catalog:read']);
    expect(updated).not.toHaveProperty('secretKey');
    expect(stored.keyHash).toBe(keyHash);
    expect(stored.keyPrefix).toBe(keyPrefix);
    await expect(service.authenticate(created.secretKey)).resolves.toMatchObject({
      scopes: ['charges:create', 'products:read', 'catalog:read'],
    });

    const repeated = await service.enableCatalogRead('integration-1');
    expect(repeated.scopes.filter((scope: string) => scope === 'catalog:read')).toHaveLength(1);
  });

  it('não concede catalog:read a integrações revogadas ou inexistentes', async () => {
    await expect(service.enableCatalogRead('nonexistent')).rejects.toThrow('Integração não encontrada');
    await service.create({ name: 'MsgDesk', scopes: ['charges:create'] }, 'admin-1');
    await service.revoke('integration-1');
    await expect(service.enableCatalogRead('integration-1')).rejects.toThrow('Integrações revogadas');
  });

  it('rotaciona a credencial e invalida a chave anterior', async () => {
    const created = await service.create(
      { name: 'MsgDesk', scopes: ['charges:create'] },
      'admin-1',
    );
    const oldKey = created.secretKey;

    const rotated = await service.rotate('integration-1');

    expect(rotated.secretKey).not.toBe(oldKey);
    await expect(service.authenticate(oldKey)).rejects.toThrow(
      'Credencial de integração inválida',
    );
    await expect(service.authenticate(rotated.secretKey)).resolves.toMatchObject({
      id: 'integration-1',
    });
  });
});
