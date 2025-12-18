require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const admin = require('firebase-admin');


const ADMIN_EMAILS = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim()) : [];
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
            return res.status(403).json({ error: 'Domínio ou usuário não autorizado.' });
        }

        let role = 'colaborador'; 
        if (ADMIN_EMAILS.includes(userEmail)) {
            role = 'admin';
        } else if (isAllowedClient) {
            role = 'cliente';
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
    const { data } = req.query;
    try {
        let query = `
            SELECT v.*, p.cnpj, p.canal 
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
    if (req.user.role === 'cliente') {
        return res.status(403).json({ error: 'Clientes não podem criar protocolos.' });
    }

    const { numero, tipo, prestador, cnpj, assunto, observacao, canal } = req.body;
    try {
        const query = `
            INSERT INTO protocolos (numero_protocolo, email_registrante, tipo, prestador, cnpj, assunto, observacao, canal) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id
        `;
        const values = [numero, req.user.email, tipo, prestador, cnpj, assunto, observacao, canal];
        await pool.query(query, values);
        res.json({ success: true, message: 'Protocolo registrado!' });
    } catch (error) {
        console.error(error);
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Este número de protocolo já existe.' });
        }
        res.status(500).json({ error: 'Erro ao registrar protocolo.' });
    }
});


app.patch('/api/protocolos/:id', verificarAuth, async (req, res) => {
    if (req.user.role === 'cliente') {
        return res.status(403).json({ error: 'Acesso negado.' });
    }

    const { id } = req.params;
    const { tratativa, status } = req.body;
    const emailResponsavel = req.user.email;

    const client = await pool.connect(); 

    try {
        await client.query('BEGIN'); 


        const buscaAtual = await client.query('SELECT status FROM protocolos WHERE id = $1', [id]);
        if (buscaAtual.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Protocolo não encontrado.' });
        }
        const statusAnterior = buscaAtual.rows[0].status;


        const updateQuery = `
            UPDATE protocolos 
            SET 
                tratativa = $1, 
                status = $2::varchar, 
                email_tratativa = $3, 
                data_fechamento = CASE WHEN $2::varchar = 'resolvido' THEN CURRENT_TIMESTAMP ELSE data_fechamento END
            WHERE id = $4
        `;
        await client.query(updateQuery, [tratativa, status, emailResponsavel, id]);


        await client.query(`
            INSERT INTO historico_protocolos 
            (protocolo_id, responsavel_email, status_anterior, status_novo, tratativa_texto)
            VALUES ($1, $2, $3, $4, $5)
        `, [id, emailResponsavel, statusAnterior, status, tratativa]);

        await client.query('COMMIT'); 
        res.json({ success: true, message: 'Protocolo atualizado e histórico salvo.' });

    } catch (error) {
        await client.query('ROLLBACK'); 
        console.error("Erro ao tratar:", error);
        res.status(500).json({ error: 'Erro ao atualizar tratativa.' });
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
        
        const prefixo = `SENADO${ano}${mes}${dia}${hora}${minuto}`;

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
            SELECT v.*, p.cnpj, p.tratativa, p.canal
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
// Rota para dados dos gráficos do Dashboard
app.get('/api/dashboard-dados', verificarAuth, async (req, res) => {
    try {
        // 1. Gráfico de Linhas (Últimos 7 dias: Solicitação x Informação x Reclamação)
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

        // 2. Top Colaboradores - Abertura (Quem mais abre chamados)
        const queryPerformanceAbertura = `
            SELECT email_registrante as email, COUNT(*) as total 
            FROM protocolos 
            GROUP BY 1 
            ORDER BY 2 DESC 
            LIMIT 5;
        `;

        // 3. Top Colaboradores - Tratativa (Quem mais resolve)
        const queryPerformanceTratativa = `
            SELECT email_tratativa as email, COUNT(*) as total 
            FROM protocolos 
            WHERE status = 'resolvido' AND email_tratativa IS NOT NULL
            GROUP BY 1 
            ORDER BY 2 DESC 
            LIMIT 5;
        `;

        // 4. Top Assuntos (Pareto)
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
// Rota para a página de Dashboard
app.get('/dashboard', (req, res) => {
    res.redirect('/html/dashboard.html');
});

app.get('/html/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'html', 'dashboard.html'));
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Protocolos rodando na porta ${PORT}`);
});