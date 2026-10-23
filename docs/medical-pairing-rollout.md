# Pareamento médico administrativo: fluxo fail-closed

## Objetivo
Uma única credencial `CanDesk Chat/CRM` pode ser utilizada nas consultas financeiras v1 e na API profissional v2 sem rotação. O pareamento altera permissões somente após participação de um ADMIN Canfy e de um ADMIN MsgDesk ativo, cada um autenticado em seu sistema.

## Operação
1. Implantar e revisar migration versionada e backend Canfy antes de habilitar a nova UI. Não há backfill automático.
2. Na área de integrações do Canfy, ADMIN seleciona a chave já usada pelo MsgDesk e gera código efêmero, expira em 10 minutos. Nenhuma permissão é ampliada nessa etapa.
3. ADMIN autenticado no MsgDesk cola o código na aba Médicos. A rota server-side valida o perfil ativo, obtém o organization_id autoritativo e usa `CANFY_API_KEY` no servidor, sem enviar a credencial ao navegador.
4. O backend Canfy exige a chave ativa + código correto, consome o código uma única vez, associa a organização e adiciona somente os escopos existentes doctors:admin:read/write, com evento de auditoria.
5. Cadastros realizados no MsgDesk passam a herdar a organização de contexto da integração; cadastros já criados no Canfy ficam sem organização até vinculação explícita à chave pareada por ADMIN Canfy. Nunca divulgar automaticamente registros sem vínculo.

## Controles
- Não altera nenhuma chave, escopo ou organização em produção durante aplicação da migration.
- Pareamento é explicitamente opt-in em dois painéis; rollback não deve reatribuir uma chave a outra organização. Rotação, revogação, reconciliação ou mudança de organização requerem fluxo administrativo separado.
- Vínculo Canfy atribui apenas médicos sem organização e sem Auth UID prévio, preserva histórico e grava evento de auditoria, incluindo uma referência de comprovação fornecida pelo operador. Médicos já vinculados a outros tenants não são transferidos.
- Nenhum token ou senha de acesso clínico é criado pelo pareamento. Financeiro e carteiras permanecem independentes.

## Dependências de publicação
Implantar backend + Prisma Canfy, painel Canfy, depois MsgDesk. Após aprovação explícita, efetuar pareamento manual e conferir `/integrations/v2/doctor-organization/status`; não presumir que merge signifique deploy. Testar com duas organizações em ambiente não produtivo antes de qualquer liberação.
