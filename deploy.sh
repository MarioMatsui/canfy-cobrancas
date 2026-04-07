#!/bin/bash
set -e

echo "=== Deploy AsaasSplit ==="

# Check env file
if [ ! -f .env.production ]; then
  echo "ERRO: .env.production não encontrado!"
  echo "Copie .env.production.example para .env.production e configure os valores."
  exit 1
fi

# Load env
export $(grep -v '^#' .env.production | xargs)

echo "1. Parando containers existentes..."
docker compose -f docker-compose.prod.yml down || true

echo "2. Construindo imagens..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "3. Iniciando serviços..."
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

echo "4. Aguardando backend ficar pronto..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T backend wget -qO- http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "   Backend pronto!"
    break
  fi
  echo "   Tentativa $i/30..."
  sleep 5
done

echo ""
echo "=== Deploy concluído! ==="
echo "Acesse: http://localhost:${HTTP_PORT:-80}"
echo ""
echo "Comandos úteis:"
echo "  docker compose -f docker-compose.prod.yml logs -f      # Ver logs"
echo "  docker compose -f docker-compose.prod.yml ps            # Status"
echo "  docker compose -f docker-compose.prod.yml down          # Parar"
echo "  docker compose -f docker-compose.prod.yml restart       # Reiniciar"
