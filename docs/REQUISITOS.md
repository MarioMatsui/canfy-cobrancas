# Requisitos Funcionais — AsaasSplit

## RF01 — Gestão de Subcontas
| ID     | Requisito | Prioridade |
|--------|-----------|------------|
| RF01.1 | Criar subconta via API Asaas (nome, CPF/CNPJ, email, telefone, etc) | Alta |
| RF01.2 | Listar subcontas com paginação e busca | Alta |
| RF01.3 | Editar dados da subconta | Média |
| RF01.4 | Ativar/desativar subconta | Média |
| RF01.5 | Sincronizar dados locais com Asaas | Alta |
| RF01.6 | Exibir saldo da subconta | Média |

## RF02 — Geração de Cobranças
| ID     | Requisito | Prioridade |
|--------|-----------|------------|
| RF02.1 | Criar cobrança avulsa (boleto, Pix, cartão) vinculada a subconta | Alta |
| RF02.2 | Criar cobrança recorrente | Alta |
| RF02.3 | Configurar vencimento, multa, juros e desconto | Alta |
| RF02.4 | Enviar notificação automática ao pagador | Média |
| RF02.5 | Listar cobranças com filtros (status, data, subconta, tipo) | Alta |
| RF02.6 | Reenviar cobrança | Média |
| RF02.7 | Cancelar cobrança | Média |

## RF03 — Automação de Splits
| ID     | Requisito | Prioridade |
|--------|-----------|------------|
| RF03.1 | Configurar regras de split (% ou valor fixo por subconta) | Alta |
| RF03.2 | Aplicar split automático no momento do pagamento | Alta |
| RF03.3 | Visualizar quem recebe quanto por cobrança | Alta |
| RF03.4 | Manter histórico de splits realizados | Média |
| RF03.5 | Validar que regras somam 100% (ou valor total) | Alta |

## RF04 — Sincronização e Webhooks
| ID     | Requisito | Prioridade |
|--------|-----------|------------|
| RF04.1 | Receber webhooks do Asaas (pagamento confirmado, atrasado, estornado) | Alta |
| RF04.2 | Sincronização periódica para garantir consistência | Média |
| RF04.3 | Fila de processamento para webhooks (sem perda de eventos) | Alta |
| RF04.4 | Log de todos os eventos recebidos | Média |
| RF04.5 | Validação de assinatura dos webhooks | Alta |

## RF05 — Painel de Gestão
| ID     | Requisito | Prioridade |
|--------|-----------|------------|
| RF05.1 | Dashboard com cobranças (pagas/pendentes/atrasadas), volume por subconta | Alta |
| RF05.2 | Tela de subcontas com status e saldo | Alta |
| RF05.3 | Tela de cobranças com detalhes e ações (reenviar, cancelar) | Alta |
| RF05.4 | Tela de splits com breakdown por cobrança | Alta |
| RF05.5 | Exportação de relatórios em CSV | Média |
| RF05.6 | Autenticação JWT no painel | Alta |

---

# Requisitos Não-Funcionais

| ID    | Requisito | Categoria |
|-------|-----------|-----------|
| RNF01 | API RESTful com documentação Swagger | Manutenibilidade |
| RNF02 | Respostas da API < 500ms (p95) | Performance |
| RNF03 | Zero perda de eventos de webhook | Confiabilidade |
| RNF04 | Painel responsivo (desktop + mobile) | Usabilidade |
| RNF05 | Dados sensíveis criptografados | Segurança |
| RNF06 | Rate limiting na API | Segurança |
| RNF07 | Logs estruturados para debugging | Observabilidade |
| RNF08 | Código 100% TypeScript com strict mode | Qualidade |
| RNF09 | Testes unitários nos módulos críticos | Qualidade |
| RNF10 | Deploy automatizado via CI/CD | DevOps |
