# NFC-e API — Café Cilla

API Node.js para emissão de NFC-e via SEFAZ-MG usando nfewizard-io.

## Deploy no Railway

1. Faça login em https://railway.app
2. Clique em "New Project" → "Deploy from GitHub repo"
3. Selecione este repositório
4. Configure as variáveis de ambiente (veja abaixo)
5. Deploy automático!

## Variáveis de ambiente obrigatórias

| Variável   | Descrição                                      |
|------------|------------------------------------------------|
| API_KEY    | Chave secreta para autenticar as chamadas      |
| CERT_URL   | URL pública do certificado .pfx                |
| CERT_SENHA | Senha do certificado digital                   |
| CSC        | Código de Segurança do Contribuinte NFC-e      |
| ID_CSC     | ID Token do CSC                                |

## Endpoints

### GET /health
Verifica se a API está online.

### POST /emitir
Emite uma NFC-e na SEFAZ-MG.

Header: `x-api-key: SUA_CHAVE`

Body:
```json
{
  "numero_nfce": 300,
  "itens": [
    {
      "codigo": "BB01",
      "descricao": "CAFÉ ESPRESSO",
      "ncm": "21011200",
      "cfop": "5102",
      "unidade": "UN",
      "quantidade": 1,
      "valor_unitario": 8.00
    }
  ],
  "forma_pagamento": "credito",
  "valor_total": 8.00,
  "data_emissao": "2026-06-27T20:00:00-03:00"
}
```

Formas de pagamento aceitas: `credito`, `debito`, `pix`, `dinheiro`
