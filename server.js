require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin');
const ExcelJS = require('exceljs');


const ADMIN_EMAILS = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()) : [];
const COLABORADOR_EMAILS = process.env.COLABORADOR_EMAILS ? process.env.COLABORADOR_EMAILS.split(',').map(e => e.trim()) : [];
const CLIENT_EMAILS = process.env.CLIENT_EMAILS ? process.env.CLIENT_EMAILS.split(',').map(e => e.trim()) : [];


try {
    if (process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            })
        });
    }
} catch (error) {
    console.error("Erro Firebase Admin:", error.message);
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});


const verificarAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    try {
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userEmail = decodedToken.email;

        const isMaida = userEmail.endsWith('@maida.health');
        const isAllowedClient = CLIENT_EMAILS.includes(userEmail);

        if (!isMaida && !isAllowedClient) {
            return res.status(403).json({ error: 'Acesso negado.' });
        }

        let role = 'restrito'; 

        if (ADMIN_EMAILS.includes(userEmail)) {
            role = 'admin';
        } else if (COLABORADOR_EMAILS.includes(userEmail)) {
            role = 'colaborador';
        } else if (isAllowedClient) {
            role = 'cliente';
        } else if (isMaida) {
            role = 'restrito'; 
        }

        req.user = { email: userEmail, role: role };
        next();
    } catch (error) {
        console.error("Erro Auth:", error);
        return res.status(403).json({ error: 'Token inválido.' });
    }
};


app.get('/api/me', verificarAuth, (req, res) => {
    res.json(req.user);
});


app.get('/api/protocolos', verificarAuth, async (req, res) => {

    if (req.user.role === 'restrito') {
        return res.json([]); 
    }
    const { data } = req.query;
    try {
        let query = `
            SELECT v.*, p.cnpj, p.canal, p.demandante 
            FROM vw_relatorio_protocolos v
            JOIN protocolos p ON v.id = p.id
        `;
        let params = [];

        if (data) {
            query += ` WHERE v.data_registro::date = $1`; 
            params.push(data);
        }
        query += ` ORDER BY v.data_registro DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar protocolos.' });
    }
});


app.post('/api/protocolos', verificarAuth, async (req, res) => {
    const { 
        numero, tipo, prestador, cnpj, assunto, observacao, canal, demandante,
        tipo_tratativa, secretaria_encaminhada, tratativa_imediata 
    } = req.body;

    const statusInicial = tipo_tratativa === 'imediato' ? 'resolvido' : 'aberto';
    const secretariaFinal = tipo_tratativa === 'imediato' ? null : secretaria_encaminhada;
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');

        const queryProtocolo = `
            INSERT INTO protocolos (
                numero_protocolo, email_registrante, tipo, prestador, cnpj, assunto, 
                observacao, canal, demandante, tipo_tratativa, secretaria_encaminhada, 
                status, tratativa, email_tratativa, data_fechamento
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 
                ${tipo_tratativa === 'imediato' ? 'CURRENT_TIMESTAMP' : 'NULL'}) 
            RETURNING id`;
        
        const valuesProt = [
            numero, req.user.email, tipo, prestador, cnpj, assunto, 
            observacao, canal, demandante, tipo_tratativa, secretariaFinal,
            statusInicial, (tipo_tratativa === 'imediato' ? tratativa_imediata : null),
            (tipo_tratativa === 'imediato' ? req.user.email : null)
        ];

        const resProt = await client.query(queryProtocolo, valuesProt);
        const novoId = resProt.rows[0].id;

        const queryMov = `
            INSERT INTO movimentacoes_protocolo (protocolo_id, secretaria_origem, secretaria_destino, usuario_responsavel, observacao)
            VALUES ($1, $2, $3, $4, $5)`;
        
        await client.query(queryMov, [
            novoId, 
            'Triagem/Atendimento', 
            secretariaFinal || 'Resolvido Imediato', 
            req.user.email,
            tipo_tratativa === 'imediato' ? 'Protocolo aberto e resolvido no ato.' : 'Encaminhamento inicial.'
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Protocolo e movimentação registrados!' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ error: 'Erro ao registrar.' });
    } finally {
        client.release();
    }
});

app.patch('/api/protocolos/:id', verificarAuth, async (req, res) => {
    const { id } = req.params;
    const { status, tratativa, nova_secretaria } = req.body;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const protAtual = await client.query('SELECT secretaria_encaminhada FROM protocolos WHERE id = $1', [id]);
        const secretariaOrigem = protAtual.rows[0].secretaria_encaminhada || 'Atendimento';

        let queryUpdate = `UPDATE protocolos SET status = $1, tratativa = $2`;
        let params = [status, tratativa, id];

        if (status === 'resolvido') {
            queryUpdate += `, data_fechamento = CURRENT_TIMESTAMP, email_tratativa = $4 WHERE id = $3`;
            params.push(req.user.email);
        } else if (nova_secretaria) {
            queryUpdate += `, secretaria_encaminhada = $4 WHERE id = $3`;
            params.push(nova_secretaria);
        } else {
            queryUpdate += ` WHERE id = $3`;
        }

        await client.query(queryUpdate, params);

        const queryMov = `
            INSERT INTO movimentacoes_protocolo (protocolo_id, secretaria_origem, secretaria_destino, usuario_responsavel, observacao)
            VALUES ($1, $2, $3, $4, $5)`;
        
        await client.query(queryMov, [
            id, 
            secretariaOrigem, 
            status === 'resolvido' ? 'Finalizado' : (nova_secretaria || secretariaOrigem), 
            req.user.email,
            tratativa || 'Mudança de status/setor.'
        ]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Erro ao atualizar.' });
    } finally {
        client.release();
    }
});


app.get('/api/proximo-protocolo', verificarAuth, async (req, res) => {
    try {
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        const hora = String(agora.getHours()).padStart(2, '0');
        const minuto = String(agora.getMinutes()).padStart(2, '0');
        
        const prefixo = `SIS${ano}${mes}${dia}${hora}${minuto}`;

        const query = `
            SELECT numero_protocolo 
            FROM protocolos 
            WHERE numero_protocolo LIKE $1 
            ORDER BY length(numero_protocolo) DESC, numero_protocolo DESC 
            LIMIT 1
        `;
        
        const result = await pool.query(query, [`${prefixo}%`]);
        let proximoNumero;

        if (result.rows.length === 0) {
            proximoNumero = `${prefixo}1`;
        } else {
            const ultimoProtocolo = result.rows[0].numero_protocolo;
            const sequencialAtual = parseInt(ultimoProtocolo.replace(prefixo, ''));
            const proximoSequencial = sequencialAtual + 1;
            proximoNumero = `${prefixo}${proximoSequencial}`;
        }

        res.json({ protocolo: proximoNumero });
    } catch (error) {
        console.error("Erro sequencial:", error);
        res.status(500).json({ error: 'Erro ao gerar número.' });
    }
});


app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.PUBLIC_FIREBASE_APP_ID
    });
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'login.html'));
});

app.get('/protocolos', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'index.html'));
});

app.get('/protocolos.html', (req, res) => {
    res.redirect('/protocolos');
});

app.get('/historico.html', (req, res) => {
    res.redirect('/html/historico.html');
});

app.get('/html/historico.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'historico.html'));
});

app.get('/api/historico', verificarAuth, async (req, res) => {
    if (req.user.role === 'restrito') {
        return res.json({ data: [], total: 0, page: 1, totalPages: 0 });
    }
    const { dataInicio, dataFim, tipo, assunto, page = 1, limit = 10 } = req.query;
    
    try {
        let whereClauses = [];
        let params = [];
        let paramIndex = 1;

        if (dataInicio) {
            whereClauses.push(`v.data_registro >= $${paramIndex}`);
            params.push(dataInicio + ' 00:00:00');
            paramIndex++;
        }

        if (dataFim) {
            whereClauses.push(`v.data_registro <= $${paramIndex}`);
            params.push(dataFim + ' 23:59:59');
            paramIndex++;
        }

        if (tipo) {
            whereClauses.push(`v.tipo = $${paramIndex}`);
            params.push(tipo);
            paramIndex++;
        }

        if (assunto) {
            whereClauses.push(`v.assunto ILIKE $${paramIndex}`);
            params.push(`%${assunto}%`);
            paramIndex++;
        }

        const whereString = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const countQuery = `
            SELECT COUNT(*) as total 
            FROM vw_relatorio_protocolos v 
            ${whereString}
        `;
        const countResult = await pool.query(countQuery, params);
        const totalItems = parseInt(countResult.rows[0].total);

        const offset = (page - 1) * limit;
        const dataQuery = `
            SELECT v.*, p.cnpj, p.tratativa, p.canal, p.demandante
            FROM vw_relatorio_protocolos v
            JOIN protocolos p ON v.id = p.id
            ${whereString}
            ORDER BY v.data_registro DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(limit, offset);
        
        const dataResult = await pool.query(dataQuery, params);

        res.json({
            data: dataResult.rows,
            total: totalItems,
            page: parseInt(page),
            totalPages: Math.ceil(totalItems / limit)
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar histórico.' });
    }
});
app.get('/api/exportar-protocolos', verificarAuth, async (req, res) => {
    if (req.user.role === 'restrito') {
        return res.status(403).send("Acesso negado.");
    }
    try {
        const query = `
            SELECT 
                numero_protocolo, data_registro, tipo, prestador, assunto, 
                status, tipo_tratativa, secretaria_encaminhada, tratativa, 
                email_registrante, email_tratativa, data_fechamento 
            FROM vw_relatorio_protocolos 
            ORDER BY data_registro DESC
        `;
        const result = await pool.query(query);

        const dadosTratados = result.rows.map(row => {
            const novaRow = { ...row };
            Object.keys(novaRow).forEach(key => {
                let valor = novaRow[key];
                if (typeof valor === 'string' && valor.length > 0) {
                    novaRow[key] = valor.charAt(0).toUpperCase() + valor.slice(1);
                }
            });
            return novaRow;
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Protocolos');

        worksheet.columns = [
            { header: 'Protocolo', key: 'numero_protocolo', width: 20 },
            { header: 'Data Registro', key: 'data_registro', width: 22 },
            { header: 'Tipo', key: 'tipo', width: 15 },
            { header: 'Prestador', key: 'prestador', width: 30 },
            { header: 'Assunto', key: 'assunto', width: 25 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Tratativa Tipo', key: 'tipo_tratativa', width: 18 },
            { header: 'Secretaria', key: 'secretaria_encaminhada', width: 20 },
            { header: 'Resolução/Tratativa', key: 'tratativa', width: 45 },
            { header: 'Registrado por', key: 'email_registrante', width: 30 },
            { header: 'Resolvido por', key: 'email_tratativa', width: 30 },
            { header: 'Data Fechamento', key: 'data_fechamento', width: 22 }
        ];

        worksheet.addRows(dadosTratados);

        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                
                if (rowNumber === 1) {
                    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF0066CC' }
                    };
                }
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Relatorio_Protocolos_Senado.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Erro ao exportar:', error);
        res.status(500).send('Erro ao gerar planilha');
    }
});

app.get('/api/dashboard-dados', verificarAuth, async (req, res) => {
    if (req.user.role === 'restrito') {
        return res.json({
            graficoLinha: [],
            rankingAbertura: [],
            rankingTratativa: [],
            rankingAssuntos: []
        });
    }
    try {

        const queryLinha = `
            SELECT 
                TO_CHAR(data_registro, 'DD/MM') as dia,
                tipo,
                COUNT(*) as total
            FROM protocolos
            WHERE data_registro >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY 1, 2
            ORDER BY 1;
        `;


        const queryPerformanceAbertura = `
            SELECT email_registrante as email, COUNT(*) as total 
            FROM protocolos 
            GROUP BY 1 
            ORDER BY 2 DESC 
            LIMIT 5;
        `;


        const queryPerformanceTratativa = `
            SELECT email_tratativa as email, COUNT(*) as total 
            FROM protocolos 
            WHERE status = 'resolvido' AND email_tratativa IS NOT NULL
            GROUP BY 1 
            ORDER BY 2 DESC 
            LIMIT 5;
        `;


        const queryAssuntos = `
            SELECT assunto, COUNT(*) as total 
            FROM protocolos 
            GROUP BY 1 
            ORDER BY 2 DESC 
            LIMIT 5;
        `;

        const [resLinha, resAbertura, resTratativa, resAssuntos] = await Promise.all([
            pool.query(queryLinha),
            pool.query(queryPerformanceAbertura),
            pool.query(queryPerformanceTratativa),
            pool.query(queryAssuntos)
        ]);

        res.json({
            graficoLinha: resLinha.rows,
            rankingAbertura: resAbertura.rows,
            rankingTratativa: resTratativa.rows,
            rankingAssuntos: resAssuntos.rows
        });

    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        res.status(500).json({ error: 'Erro no servidor' });
    }
});

app.get('/dashboard', (req, res) => {
    res.redirect('/html/dashboard.html');
});

app.get('/api/protocolos/:id/movimentacoes', verificarAuth, async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT 
                secretaria_origem, 
                secretaria_destino, 
                usuario_responsavel, 
                observacao, 
                to_char(data_movimentacao, 'DD/MM/YYYY HH24:MI') as data_formatada
            FROM movimentacoes_protocolo 
            WHERE protocolo_id = $1 
            ORDER BY data_movimentacao DESC
        `;
        const result = await pool.query(query, [id]);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

app.get('/html/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'dashboard.html'));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Protocolos rodando na porta ${PORT}`);
});