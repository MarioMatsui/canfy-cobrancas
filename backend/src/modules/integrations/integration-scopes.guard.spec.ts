import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IntegrationScopesGuard } from './integration-scopes.guard';

describe('IntegrationScopesGuard', () => {
  it('permite quando todos os scopes exigidos estão presentes', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['charges:create']),
    } as unknown as Reflector;
    const guard = new IntegrationScopesGuard(reflector);
    const context = {
      getHandler: () => jest.fn(),
      getClass: () => class Test {},
      switchToHttp: () => ({
        getRequest: () => ({
          integration: { id: '1', name: 'MsgDesk', scopes: ['charges:create'] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('bloqueia quando falta scope', () => {
    const reflector = {
      getAllAndOverride: jest.fn(() => ['charges:cancel']),
    } as unknown as Reflector;
    const guard = new IntegrationScopesGuard(reflector);
    const context = {
      getHandler: () => jest.fn(),
      getClass: () => class Test {},
      switchToHttp: () => ({
        getRequest: () => ({
          integration: { id: '1', name: 'MsgDesk', scopes: ['charges:read'] },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
