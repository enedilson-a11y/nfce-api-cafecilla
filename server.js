require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const NFeWizard = require('nfewizard-io').default || require('nfewizard-io');

const app = express();
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'mude-esta-chave';

// Middleware de autenticação simples
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', servico: 'NFC-e API Café Cilla', versao: '2.0.0' });
});

// Mapeamento forma de pagamento → tPag
const FORMA_PAGAMENTO = {
  'credito': '03',
  'debito': '04',
  'pix': '17',
  'dinheiro': '01',
  '03': '03',
  '04': '04',
  '17': '17',
  '01': '01'
};

// Emissão de NFC-e
app.post('/emitir', async (req, res) => {
  const {
    numero_nfce,
    itens,
    forma_pagamento,
    valor_total,
    data_emissao
  } = req.body;

  const CERT_B64 = process.env.CERT_B64;
  const CERT_SENHA = process.env.CERT_SENHA;
  const CSC = process.env.CSC || '0d4a86666f50bba3c658b4f35524768c';
  const ID_CSC = parseInt(process.env.ID_CSC || '1');

  if (!CERT_B64 || !CERT_SENHA) {
    return res.status(500).json({ sucesso: false, erro: 'Certificado não configurado (CERT_B64 / CERT_SENHA)' });
  }

  if (!numero_nfce || !itens || !itens.length || !forma_pagamento || !valor_total) {
    return res.status(400).json({ sucesso: false, erro: 'Campos obrigatórios: numero_nfce, itens, forma_pagamento, valor_total' });
  }

  const certPath = path.join('/tmp', `cafecilla_cert_${Date.now()}.pfx`);

  try {
    // 1. Gravar certificado a partir do base64
    const certBuffer = Buffer.from(CERT_B64, 'base64');
    fs.writeFileSync(certPath, certBuffer);
    console.log(`[emitir] Certificado gravado (${certBuffer.length} bytes)`);

    // 2. Inicializar NFeWizard
    const nfeWizard = new NFeWizard();
    await nfeWizard.NFE_LoadEnvironment({
      config: {
        dfe: {
          baixarXMLDistribuicao: false,
          pathXMLDistribuicao: '/tmp/nfe/distribuicao',
          armazenarXMLAutorizacao: true,
          pathXMLAutorizacao: '/tmp/nfe/autorizacao',
          armazenarXMLRetorno: false,
          pathXMLRetorno: '/tmp/nfe/retorno',
          armazenarXMLConsulta: false,
          pathXMLConsulta: '/tmp/nfe/consulta',
          armazenarXMLConsultaComTagSoap: false,
          armazenarRetornoEmJSON: false,
          pathRetornoEmJSON: '/tmp/nfe/json',
          pathCertificado: certPath,
          senhaCertificado: CERT_SENHA,
          UF: 'MG',
          CPFCNPJ: '61354970000180',
        },
        nfe: {
          ambiente: 1, // 1=Produção, 2=Homologação
          versaoDF: '4.00',
          idCSC: ID_CSC,
          tokenCSC: CSC
        },
        lib: {
          connection: { timeout: 30000 }
        }
      }
    });

    // 3. Montar data de emissão
    const now = new Date();
    // Formata em horário de Brasília (UTC-3)
    const dhEmi = data_emissao || (() => {
      const br = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      return br.toISOString().replace('Z', '-03:00');
    })();

    // 4. Montar itens da NFC-e
    const det = itens.map((item, idx) => ({
      prod: {
        cProd: String(item.codigo || idx + 1).padStart(8, '0'),
        cEAN: 'SEM GTIN',
        xProd: item.descricao.substring(0, 120).toUpperCase(),
        NCM: String(item.ncm || '21011200').replace(/\D/g, ''),
        CFOP: 5102,
        uCom: item.unidade || 'UN',
        qCom: parseFloat(item.quantidade) || 1,
        vUnCom: parseFloat(item.valor_unitario).toFixed(10),
        vProd: (parseFloat(item.quantidade || 1) * parseFloat(item.valor_unitario)).toFixed(2),
        cEANTrib: 'SEM GTIN',
        uTrib: item.unidade || 'UN',
        qTrib: parseFloat(item.quantidade) || 1,
        vUnTrib: parseFloat(item.valor_unitario).toFixed(10),
        indTot: 1
      },
      imposto: {
        ICMS: {
          ICMSSN400: {
            orig: 0,
            CSOSN: '400'
          }
        },
        PIS: { PISNT: { CST: '07' } },
        COFINS: { COFINSNT: { CST: '07' } }
      }
    }));

    // 5. Calcular totais
    const vProd = det.reduce((acc, d) => acc + parseFloat(d.prod.vProd), 0);
    const vNF = parseFloat(valor_total).toFixed(2);

    // 6. Mapeamento pagamento
    const tPag = FORMA_PAGAMENTO[forma_pagamento.toLowerCase()] || '99';

    // 7. Gerar cNF aleatório (8 dígitos)
    const cNF = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');

    // 8. Montar payload NFC-e
    const payload = {
      indSinc: 1,
      idLote: numero_nfce,
      NFe: [{
        infNFe: {
          ide: {
            cUF: 31, // MG
            cNF,
            natOp: 'VENDA DE MERCADORIA',
            mod: 65,
            serie: 1,
            nNF: numero_nfce,
            dhEmi,
            tpNF: 1,
            idDest: 1,
            cMunFG: 3102050, // Alto Caparaó
            tpImp: 4,
            tpEmis: 1,
            cDV: 0,
            tpAmb: 1, // Produção
            finNFe: 1,
            indFinal: 1,
            indPres: 1,
            indIntermed: 0,
            procEmi: 0,
            verProc: '1.0.0'
          },
          emit: {
            CNPJCPF: '61354970000180',
            xNome: 'CAFE CILLA LTDA',
            xFant: 'CAFE CILLA',
            enderEmit: {
              xLgr: 'RUA PRINCIPAL',
              nro: 'S/N',
              xBairro: 'CENTRO',
              cMun: 3102050,
              xMun: 'ALTO CAPARAO',
              UF: 'MG',
              CEP: '36985000',
              cPais: 1058,
              xPais: 'BRASIL',
              fone: ''
            },
            IE: '0052274120099',
            CRT: 1 // Simples Nacional
          },
          det,
          total: {
            ICMSTot: {
              vBC: '0.00',
              vICMS: '0.00',
              vICMSDeson: '0.00',
              vFCP: '0.00',
              vBCST: '0.00',
              vST: '0.00',
              vFCPST: '0.00',
              vFCPSTRet: '0.00',
              vProd: vProd.toFixed(2),
              vFrete: '0.00',
              vSeg: '0.00',
              vDesc: '0.00',
              vII: '0.00',
              vIPI: '0.00',
              vIPIDevol: '0.00',
              vPIS: '0.00',
              vCOFINS: '0.00',
              vOutro: '0.00',
              vNF
            }
          },
          transp: { modFrete: 9 },
          pag: {
            detPag: [{
              indPag: 1,
              tPag,
              vPag: vNF
            }]
          }
        }
      }]
    };

    // 9. Emitir
    console.log(`[emitir] Transmitindo NFC-e nº ${numero_nfce}...`);
    const resultado = await nfeWizard.NFCE_Autorizacao(payload);
    console.log(`[emitir] Retorno:`, JSON.stringify(resultado?.[0]?.protNFe?.infProt || {}));

    const infProt = resultado?.[0]?.protNFe?.infProt;
    const xml = resultado?.[0]?.xml;

    if (!infProt || infProt.cStat !== '100') {
      return res.json({
        sucesso: false,
        erro: `SEFAZ rejeitou: ${infProt?.xMotivo || 'Sem resposta'}`,
        cStat: infProt?.cStat,
        xMotivo: infProt?.xMotivo
      });
    }

    return res.json({
      sucesso: true,
      numero: numero_nfce,
      protocolo: infProt.nProt,
      chave: infProt.chNFe,
      xml: xml || null,
      cStat: infProt.cStat,
      xMotivo: infProt.xMotivo
    });

  } catch (err) {
    console.error('[emitir] Erro:', err.message, err.stack?.split('\n').slice(0, 5).join('\n'));
    return res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  } finally {
    if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
  }
});

app.listen(PORT, () => {
  console.log(`✅ NFC-e API v2.0 rodando na porta ${PORT}`);
});
