# Catálogo Canfy → MsgDesk

## Arquitetura
O banco PostgreSQL do Canfy Cobranças é a única fonte oficial. A API autenticada GET /api/integrations/v1/catalog/products publica o catálogo completo apenas para credenciais com scope `catalog:read`; não permite edições. GET /api/integrations/v1/products continua destinado à seleção de itens aptos para cobrança. `ProductsService` é o serviço de leitura comum.

## Implantação (executar somente após validação)
1. Validar backup e schema de produção antes de aplicar `backend/prisma/migrations/20261019120000_product_catalog_media/migration.sql` via `npx prisma migrate deploy`. A migration adiciona campos opcionais, sem excluir dados.
2. Garantir que o backend use diretório persistente `PRODUCT_MEDIA_DIR` (no Docker, volume `product_media`); para PM2, configure diretório absoluto persistente com permissões de escrita para o processo.
3. Configurar `PRODUCT_MEDIA_PUBLIC_BASE_URL=https://cobranca.canfy.com.br/api/products/media/file` no ambiente privado. Não usar Rocket Secrets nem versionar chaves.
4. Publicar backend compatível antes da interface de cadastro e do MsgDesk.
5. Para **reutilizar a chave existente do MsgDesk** (recomendado nesta implantação), acessar **Configurações → Integrações** do Canfy Cobranças, localizar a integração já usada pelo MsgDesk e clicar em **Habilitar catálogo**. A API admin concede `catalog:read` de forma aditiva; não revoga nem rotaciona a chave e mantém, por exemplo, `charges:create`, `charges:read`, `products:read`. A operação exige usuário ADMIN e a publicação do backend e frontend que incluem o botão e o endpoint.
6. O MsgDesk já utiliza `CANFY_API_KEY` como fallback para o catálogo quando `CANFY_CATALOG_API_KEY` está ausente/vazia; portanto, **nenhum segredo novo é necessário**. Se a variável opcional `CANFY_CATALOG_API_KEY` estiver preenchida com uma chave diferente, ela prevalece — para reutilizar a chave padrão, remova-a ou deixe-a vazia na configuração privada do MsgDesk e recarregue o processo. Após habilitar, testar o endpoint de catálogo para paginação, `summary`, `facets` e autenticação owner/admin/agent.

## Mídia
Upload autorizado exclusivamente para ADMIN em POST /api/products/media/upload (multipart: kind=image|coa, file). Extensões permitidas JPG, PNG, WEBP e PDF; limite 8MB, inspeção de assinatura e filename aleatório. URLs armazenadas no cadastro podem ser substituídas. GET /api/products/media/file/:filename é **público**, intencionalmente para fotografias e COAs comerciais compartilháveis. Não envie dados pessoais, receitas, arquivos restritos ou material clínico nesse endpoint.

A implementação armazena o arquivo na VPS/volume, não no banco. Fazer backup periódico desse volume. O upload usa referência URL; remover/substituir referência não apaga imediatamente o arquivo antigo: programar política de limpeza de mídia órfã quando necessário.

## Cotação
O serviço AwesomeAPI retorna `ask` de USD/BRL. A taxa efetiva é `marketRate + 0.03`, preservando decimal. O valor unitário convertido é arredondado para duas casas. `ExchangeRateService.rate` é a taxa **aplicada**, `marketRate` é a cotação bruta, `markup` é o acréscimo. Novas cobranças capturam a taxa e os valores ao serem criadas; cobranças antigas não são recalculadas.

## Observabilidade e limites
O catálogo do MsgDesk consulta a cada 45s enquanto visível, no retorno do foco e sob demanda. Queda do câmbio não impede consultas de catálogo, mas impede um novo preço BRL confiável para produtos USD. Ordenação de preço cruza moedas após conversão no servidor; avalie indexação/otimização caso o volume cresça para dezenas de milhares de produtos. Todos os KPI são globais no conjunto autorizado, e não apenas na página.

## Testes de aceite
Validar em homologação (nacional/internacional, ativo/inativo, falta COA/imagem, edição, alteração de fornecedor, câmbio indisponível, ID original e criação de cobrança com snapshot). Validar permissões, 401/403, volume persistente, backups, split, frete e checkout sem regressão.
