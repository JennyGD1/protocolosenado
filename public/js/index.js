const token = localStorage.getItem('maida_token');
let userRole = 'guest';
let filtroStatusAtual = null;
let idEmResolucao = null;

if (!token) window.location.href = '/';

class ProtocoloManager {
    constructor() {
        this.apiBase = '/api';
    }

    async request(endpoint, options = {}) {
        const currentToken = localStorage.getItem('maida_token');

        if (!currentToken) {
            console.warn("Sem token. Redirecionando...");
            window.location.href = '/';
            return; 
        }

        const defaultHeaders = {
            'Authorization': `Bearer ${currentToken}`, 
            'Content-Type': 'application/json'
        };

        const config = {
            ...options,
            headers: { ...defaultHeaders, ...options.headers }
        };

        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, config);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async getProtocolos(dataFiltro = '') {
        const endpoint = dataFiltro ? `/protocolos?data=${dataFiltro}` : '/protocolos';
        return this.request(endpoint);
    }

    async getProtocolo(id) {
        return this.request(`/protocolos/${id}`);
    }

    async getMovimentacoes(id) {
        return this.request(`/protocolos/${id}/movimentacoes`);
    }

    async updateProtocolo(id, data) {
        return this.request(`/protocolos/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    async createProtocolo(data) {
        return this.request('/protocolos', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async getProximoProtocolo() {
        return this.request('/proximo-protocolo');
    }

    async getUsuario() {
        return this.request('/me');
    }
}

const protocoloManager = new ProtocoloManager();

async function inicializar() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('filtroData').value = hoje;

    try {
        const user = await protocoloManager.getUsuario();
        userRole = user.role;
        
        const userDisplay = document.getElementById('user-display');
        const photoContainer = document.getElementById('user-photo-container');
        const photoEl = document.getElementById('user-photo');
        
        if (userDisplay) {
            userDisplay.textContent = user.name || user.email;
        }
        
        if (photoContainer && photoEl) {
            if (user.picture) {
                photoEl.src = user.picture;
                photoContainer.style.display = 'flex';
                
                photoEl.onerror = function() {
                    console.warn("Falha ao carregar foto do Google");
                    this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=0066cc&color=fff`;
                };
            } else {
                photoEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || user.email)}&background=0066cc&color=fff`;
                photoContainer.style.display = 'flex';
            }
        }

        if (userRole === 'restrito') {
            bloquearInterfaceRestrita();
            return; 
        }

        carregarProtocolos();
    } catch (error) {
        console.error(error);
        logout();
    }
}
function bloquearInterfaceRestrita() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) navLinks.style.display = 'none';

    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div style="text-align: center; margin-top: 50px; padding: 40px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <div style="color: #fbc02d; margin-bottom: 20px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <h2 style="color: #333; margin-bottom: 10px;">Acesso Pendente</h2>
                <p style="color: #666; font-size: 1.1rem;">Seu login foi realizado com sucesso, mas você ainda não possui permissão para visualizar os protocolos.</p>
                <p style="color: #666; margin-top: 10px;">Solicite acesso ao administrador do sistema.</p>
            </div>
        `;
    }
    
    const fab = document.getElementById('btnNovoProtocolo');
    if(fab) fab.style.display = 'none';
}
async function carregarProtocolos() {
    const lista = document.getElementById('listaProtocolos');
    if (!lista) return;

    const dataFiltro = document.getElementById('filtroData').value;
    const busca = document.getElementById('buscaGeral').value.toLowerCase();

    try {
        const protocolos = await protocoloManager.getProtocolos(dataFiltro);
        lista.innerHTML = '';

        protocolos.forEach(protocolo => {
            const tr = document.createElement('tr');
            tr.innerHTML = criarLinhaProtocolo(protocolo);
            lista.appendChild(tr);
        });

        atualizarContadores(protocolos);
    } catch (error) {
        console.error('Erro ao carregar protocolos:', error);
    }
}
function formatarTexto(texto) {
    if (!texto) return '-';
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function criarLinhaProtocolo(protocolo) {
    const statusSelect = protocolo.status !== 'resolvido' 
        ? criarSelectStatus(protocolo)
        : `<span class="status-badge status-resolvido">${protocolo.status.toUpperCase()}</span>`;

    const btnResolver = protocolo.status !== 'resolvido' ? criarBotaoResolver(protocolo.id) : '';

    let iconeCanal = '';
    if (protocolo.canal === 'email') {
        iconeCanal = `<div class="icon-canal" title="Email"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></div>`;
    } else {
        iconeCanal = `<div class="icon-canal" title="Telefone"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg></div>`;
    }

    const horaRegistro = new Date(protocolo.data_registro).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tipoFormatado = formatarTexto(protocolo.tipo);
    const assuntoFormatado = formatarTexto(protocolo.assunto);

    return `
        <td>${horaRegistro}</td>
        <td class="coluna-canal">${iconeCanal}</td>
        <td class="protocolo-clicavel" onclick="verRelatoInicial(${protocolo.id})">
            <strong>${protocolo.numero_protocolo}</strong>
        </td>
        <td>${tipoFormatado}</td>
        <td>
            ${protocolo.prestador || '-'}
            ${protocolo.demandante ? `<br><small style="color:#0066cc">Solicitante: ${protocolo.demandante}</small>` : ''}
        </td>
        <td>${assuntoFormatado}</td>
        <td>
            <div class="acoes-container">
                ${statusSelect}
            </div>
        </td>
        <td>
            <div class="acoes-container">
                ${btnResolver}
                <button class="btn-acao btn-detalhes" onclick="verDetalhes(${protocolo.id})" title="Ver detalhes">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                </button>
            </div>
        </td>
    `;
}
function exibirModalFeedback(titulo, mensagem, tipo = 'success') {
    const modal = document.getElementById('modalSucessoFechamento');
    const titleEl = modal.querySelector('.modal-title');
    const bodyEl = modal.querySelector('.modal-body');
    const iconEl = modal.querySelector('.modal-icon');

    titleEl.innerText = titulo;
    bodyEl.innerHTML = mensagem;
    
    if (tipo === 'info') {
        titleEl.className = 'modal-title info';
        iconEl.className = 'modal-icon info';
    } else {
        titleEl.className = 'modal-title success';
        iconEl.className = 'modal-icon success';
    }

    modal.style.display = 'flex';
}
function criarSelectStatus(protocolo) {
    return `
        <select onchange="alterarStatusDireto(${protocolo.id}, this.value)" class="status-select status-${protocolo.status.replace(/\s+/g, '-')}">
            <option value="aberto" ${protocolo.status === 'aberto' ? 'selected' : ''}>ABERTO</option>
            <option value="em andamento" ${protocolo.status === 'em andamento' ? 'selected' : ''}>EM ANDAMENTO</option>
        </select>
    `;
}

function criarBotaoResolver(id) {
    return `
        <button class="btn-acao btn-resolver" onclick="abrirModalResolucao(${id})" title="Encaminhar ou Resolver">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
    `;
}

function atualizarContadores(protocolos) {
    const contadores = {
        total: protocolos.length,
        aberto: protocolos.filter(p => p.status === 'aberto').length,
        andamento: protocolos.filter(p => p.status === 'em andamento').length,
        resolvido: protocolos.filter(p => p.status === 'resolvido').length
    };

    document.getElementById('count-total').textContent = contadores.total;
    document.getElementById('count-aberto').textContent = contadores.aberto;
    document.getElementById('count-andamento').textContent = contadores.andamento;
    document.getElementById('count-resolvido').textContent = contadores.resolvido;
}

function selecionarTratativa(tipo) {
    document.querySelectorAll('#modalNovo .selector-btn').forEach(btn => btn.classList.remove('active'));
    
    const btnSelecionado = document.getElementById(`btn-trat-${tipo}`);
    if (btnSelecionado) {
        btnSelecionado.classList.add('active');
    }

    document.getElementById('form-tipo-tratativa').value = tipo;

    document.getElementById('group-imediato').classList.toggle('hidden', tipo !== 'imediato');
    document.getElementById('group-encaminhamento').classList.toggle('hidden', tipo !== 'encaminhado');

    if (tipo === 'encaminhado' && !document.getElementById('form-secretaria').value) {
        document.getElementById('form-secretaria').value = 'Atendimento';
    }
}

async function verDetalhes(id) {
    const modal = document.getElementById('modalVisualizar');
    const elements = {
        protocolo: document.getElementById('detalheProtocolo'),
        relatoInicial: document.getElementById('detalheRelatoInicial'),
        resolucaoFinal: document.getElementById('detalheResolucaoFinal'),
        resolucaoFinalGroup: document.getElementById('groupResolucaoFinal'),
        resolvidoPor: document.getElementById('detalheResolvidoPor'),
        historico: document.getElementById('detalheHistorico')
    };

    modal.style.display = 'flex';

    try {
        const [protocolos, movimentacoes] = await Promise.all([
            protocoloManager.getProtocolos(),
            protocoloManager.getMovimentacoes(id)
        ]);

        const protocolo = protocolos.find(p => p.id === id);
        if (protocolo) {
            exibirDetalhesProtocolo(protocolo, elements, movimentacoes);
        }

        exibirHistorico(movimentacoes, elements.historico, protocolo);
    } catch (error) {
        console.error('Erro ao carregar detalhes:', error);
        elements.historico.innerHTML = '<p style="color:red; padding:10px;">Erro ao carregar dados.</p>';
    }
}
function exibirDetalhesProtocolo(protocolo, elements, movimentacoes) {
    elements.protocolo.textContent = `${protocolo.numero_protocolo} - ${protocolo.assunto}`;
    
    // Encontrar o relato inicial
    let relatoInicial = "Nenhum relato inicial registrado.";
    if (movimentacoes && movimentacoes.length > 0) {
        const abertura = movimentacoes.find(m => 
            m.observacao && m.observacao.includes('Abertura/Relato:')
        );
        if (abertura) {
            relatoInicial = abertura.observacao.replace('Abertura/Relato: ', '');
        } else {
            relatoInicial = movimentacoes[movimentacoes.length - 1].observacao || relatoInicial;
        }
    }
    
    elements.relatoInicial.value = relatoInicial;
    
    // Obter elementos do DOM
    const container = document.getElementById('detalhesContainer');
    const colunaResolucao = document.getElementById('colunaResolucao');
    const colunaStatus = document.getElementById('colunaStatus');
    
    // Mostrar/ocultar resolução final e status atual
    if (protocolo.status === 'resolvido' && protocolo.tratativa) {
        // Protocolo resolvido: mostrar duas colunas
        container.classList.add('duas-colunas');
        colunaResolucao.style.display = 'flex';
        colunaStatus.style.display = 'none';
        elements.resolucaoFinal.value = protocolo.tratativa;
    } else {
        // Protocolo não resolvido: mostrar apenas uma coluna
        container.classList.remove('duas-colunas');
        colunaResolucao.style.display = 'none';
        colunaStatus.style.display = 'flex';
    }
    
    if (protocolo.email_tratativa) {
        const dataFechamento = protocolo.data_fechamento 
            ? new Date(protocolo.data_fechamento).toLocaleString() 
            : '-';
        elements.resolvidoPor.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#28a745" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <div>
                    <strong>Resolvido por:</strong> ${protocolo.email_tratativa}<br>
                    <small style="color: #666;">em ${dataFechamento}</small>
                </div>
            </div>
        `;
    } else {
        const statusIcon = protocolo.status === 'aberto' ? 
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f57f17" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>` :
            `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0066cc" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>`;
        
        elements.resolvidoPor.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                ${statusIcon}
                <div>
                    <strong>Status Atual:</strong> ${protocolo.status.toUpperCase()}
                </div>
            </div>
        `;
    }
}

function exibirHistorico(movimentacoes, container, protocolo) {
    if (!movimentacoes || movimentacoes.length === 0) {
        container.innerHTML = '<p style="padding:10px; color:#777; font-style:italic;">Nenhuma movimentação registrada.</p>';
        return;
    }

    const historicoFiltrado = movimentacoes.filter(m => 
        !(protocolo.status === 'resolvido' && 
          protocolo.tratativa && 
          m.observacao && 
          m.observacao.includes('Tratativa Final:'))
    );

    const html = historicoFiltrado.map(m => {
        const isResolvido = m.secretaria_destino === 'Finalizado' || 
                           m.secretaria_destino === 'Resolvido Imediato';
        
        const textoFormatado = (m.observacao || 'Sem observação')
            .replace(/(Abertura\/Relato:|Solução Final:|Encaminhamento:)/g, '<strong>$1</strong>');

        return `
        <div class="timeline-item">
            <div class="timeline-icon" style="border-color: ${isResolvido ? '#28a745' : '#0066cc'}">
               ${isResolvido 
                    ? '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#28a745" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
                    : '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="#0066cc" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>'
                }
            </div>
            <div class="timeline-date">${m.data_formatada}</div>
            <div class="timeline-content">
                <div style="margin-bottom:4px;">
                    <span style="color:#666;">${m.secretaria_origem}</span> 
                    <strong>➜</strong> 
                    <strong style="color:#333;">${m.secretaria_destino}</strong>
                </div>
                <div class="observation-box">
                    ${textoFormatado}
                </div>
                <small style="color:#0066cc; display:block; margin-top:4px;">
                    Resp: ${m.usuario_responsavel}
                </small>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;
}

async function alterarStatusDireto(id, novoStatus) {
    if (novoStatus === 'resolvido') {
        abrirModalResolver(id);
        return;
    }

    try {
        await protocoloManager.updateProtocolo(id, {
            status: novoStatus,
            tratativa: `Status alterado manualmente para ${novoStatus}`
        });
        carregarProtocolos();
    } catch (error) {
        alert("Erro ao atualizar status");
    }
}

function abrirModalResolver(id) {
    idEmResolucao = id;
    document.getElementById('resolucao-texto').value = '';
    document.getElementById('modalResolver').style.display = 'flex';
}

async function confirmarResolucao() {
    if (!idEmResolucao) return;

    const textoResolucao = document.getElementById('resolucao-texto').value.trim();
    if (!textoResolucao) {
        alert("Por favor, descreva a solução para finalizar o protocolo.");
        return;
    }

    const btn = document.getElementById('btnConfirmarResolucao');
    btn.innerText = "Finalizando...";
    btn.disabled = true;

    try {
        await protocoloManager.updateProtocolo(idEmResolucao, {
            status: 'resolvido',
            tratativa: textoResolucao
        });

        fecharModal('modalResolver');
        carregarProtocolos();
        document.getElementById('modalSucessoFechamento').style.display = 'flex';
    } catch (error) {
        alert("Erro ao finalizar protocolo.");
    } finally {
        btn.innerText = "Confirmar Resolução";
        btn.disabled = false;
    }
}

async function salvarProtocolo() {
    const formData = coletarDadosFormulario();

    if (!validarFormulario(formData)) return;

    const btnSalvar = document.querySelector('#modalNovo .btn-primary');
    btnSalvar.innerText = "Salvando...";
    btnSalvar.disabled = true;

    try {
        await protocoloManager.createProtocolo(formData);
        
        fecharModal('modalNovo');
        document.getElementById('texto-protocolo-criado').innerText = formData.numero;
        document.getElementById('modalSucesso').style.display = 'flex';
        carregarProtocolos();
        limparFormulario();
    } catch (error) {
        alert("Erro ao salvar protocolo.");
    } finally {
        btnSalvar.innerText = "Confirmar Registro";
        btnSalvar.disabled = false;
    }
}

function coletarDadosFormulario() {
    return {
        numero: document.getElementById('form-numero').value,
        tipo: document.getElementById('form-tipo').value,
        prestador: document.getElementById('form-prestador').value,
        cnpj: document.getElementById('form-cnpj').value,
        assunto: document.getElementById('form-assunto').value,
        observacao: document.getElementById('form-obs').value,
        canal: document.getElementById('form-canal').value,
        demandante: document.getElementById('form-demandante').value,
        tipo_tratativa: document.getElementById('form-tipo-tratativa').value,
        secretaria_encaminhada: document.getElementById('form-secretaria').value,
        tratativa_imediata: document.getElementById('form-tratativa-imediata').value
    };
}
async function verRelatoInicial(id) {
    const modal = document.getElementById('modalRelatoRapido');
    const texto = document.getElementById('textoRelatoRapido');
    const titulo = document.getElementById('tituloRelatoRapido');
    const numeroProtocolo = document.getElementById('numeroProtocoloRapido');
    const dataRegistro = document.getElementById('dataRegistroRapido');
    
    try {
        const res = await fetch(`/api/protocolos/${id}/movimentacoes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const movimentacoes = await res.json();
        
        // Buscar também os dados do protocolo para pegar número e data
        const protocolos = await protocoloManager.getProtocolos();
        const protocolo = protocolos.find(p => p.id === id);
        
        if (protocolo) {
            numeroProtocolo.textContent = protocolo.numero_protocolo;
            const data = new Date(protocolo.data_registro);
            dataRegistro.textContent = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
        
        if (movimentacoes.length > 0) {
            // Encontrar a abertura (última movimentação ou a que contém "Abertura/Relato:")
            let abertura;
            for (let i = movimentacoes.length - 1; i >= 0; i--) {
                if (movimentacoes[i].observacao && movimentacoes[i].observacao.includes('Abertura/Relato:')) {
                    abertura = movimentacoes[i];
                    break;
                }
            }
            
            // Se não encontrou específico, pega a última
            if (!abertura && movimentacoes.length > 0) {
                abertura = movimentacoes[movimentacoes.length - 1];
            }
            
            if (abertura) {
                titulo.innerText = `Relato do Protocolo`;
                const relatoLimpo = abertura.observacao.replace('Abertura/Relato: ', '').replace('Encaminhamento: ', '');
                texto.innerText = relatoLimpo;
                modal.style.display = 'flex';
            }
        } else {
            // Caso não tenha movimentações, mostrar mensagem
            texto.innerText = "Nenhum relato inicial encontrado para este protocolo.";
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.error("Erro ao carregar relato", e);
        texto.innerText = "Erro ao carregar o relato do protocolo. Tente novamente.";
        modal.style.display = 'flex';
    }
}
function validarFormulario(data) {
    if (!data.tipo_tratativa) {
        alert("Selecione se o atendimento é Imediato ou Encaminhado.");
        return false;
    }

    if (data.tipo_tratativa === 'imediato' && !data.tratativa_imediata.trim()) {
        alert("Para resolução imediata, preencha a descrição da solução.");
        return false;
    }

    if (!data.numero || !data.prestador || !data.assunto) {
        alert("Preencha os campos obrigatórios.");
        return false;
    }

    return true;
}

function limparFormulario() {
    const campos = ['form-prestador', 'form-cnpj', 'form-demandante', 'form-assunto', 'form-obs', 'form-tratativa-imediata'];
    campos.forEach(id => document.getElementById(id).value = '');
}

function selecionarCanal(tipo) {
    document.querySelectorAll('#modalNovo .selector-btn').forEach(btn => btn.classList.remove('active'));
    
    const btnSelecionado = document.getElementById(`btn-canal-${tipo}`);
    if (btnSelecionado) {
        btnSelecionado.classList.add('active');
    }
    
    document.getElementById('form-canal').value = tipo;
}

function filtrarStatus(status) {
    filtroStatusAtual = status;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    
    const cardMap = {
        null: 'card-total-box',
        'aberto': 'card-aberto-box',
        'em andamento': 'card-andamento-box',
        'resolvido': 'card-resolvido-box'
    };

    const cardId = cardMap[status];
    if (cardId) document.getElementById(cardId).classList.add('active');
    
    carregarProtocolos();
}

async function abrirModalNovo() {
    document.getElementById('modalNovo').style.display = 'flex';
    const inputNumero = document.getElementById('form-numero');
    inputNumero.value = "Gerando...";
    inputNumero.disabled = true;

    try {
        const data = await protocoloManager.getProximoProtocolo();
        inputNumero.value = data.protocolo;
    } catch (error) {
        inputNumero.value = "";
        inputNumero.placeholder = "Erro ao gerar.";
    } finally {
        inputNumero.disabled = false;
    }
}

function alternarCamposResolucao() {
    const acao = document.getElementById('acao-tratativa').value;
    const groupSecretaria = document.getElementById('group-nova-secretaria');
    const labelDesc = document.getElementById('label-desc-tratativa');

    if (acao === 'resolver') {
        groupSecretaria.classList.add('hidden');
        labelDesc.innerText = "Descrição da Resolução:";
    } else {
        groupSecretaria.classList.remove('hidden');
        labelDesc.innerText = "Observação do Encaminhamento:";
    }
}

async function confirmarMovimentacao() {
    const modal = document.getElementById('modalResolucao');
    const id = modal.dataset.protocoloId;
    const acao = document.getElementById('acao-tratativa').value;
    const tratativa = document.getElementById('texto-tratativa').value.trim();
    const novaSecretaria = document.getElementById('form-nova-secretaria').value;
    
    const btnConfirmar = modal.querySelector('.btn-primary');

    if (acao === 'resolver' && !tratativa) {
        alert("Para finalizar o protocolo, é obrigatório descrever a solução.");
        return;
    }

    btnConfirmar.disabled = true;
    const textoOriginal = btnConfirmar.innerText;
    btnConfirmar.innerText = "Processando...";

    const payload = {
        status: acao === 'resolver' ? 'resolvido' : 'em andamento',
        tratativa: tratativa,
        nova_secretaria: acao === 'encaminhar' ? novaSecretaria : null
    };

    try {
        await protocoloManager.updateProtocolo(id, payload);
        fecharModal('modalResolucao');
        carregarProtocolos();
        
        if (acao === 'resolver') {
            exibirModalFeedback('Protocolo Finalizado!', 'O status foi alterado para <strong>Concluído</strong> e a tratativa foi registrada.');
        } else {
            exibirModalFeedback('Protocolo Encaminhado!', `O protocolo foi movido para o setor <strong>${novaSecretaria}</strong> com sucesso.`);
        }

    } catch (error) {
        console.error("Erro na movimentação:", error);
        alert("Erro ao processar a movimentação.");
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.innerText = textoOriginal;
    }
}

function abrirModalResolucao(id) {
    const modal = document.getElementById('modalResolucao');
    modal.dataset.protocoloId = id;
    modal.style.display = 'flex';
    
    document.getElementById('acao-tratativa').value = 'encaminhar';
    document.getElementById('texto-tratativa').value = '';
    alternarCamposResolucao();
}

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
}

function logout() {
    localStorage.clear();
    window.location.href = '/';
}

document.getElementById('filtroData').addEventListener('change', carregarProtocolos);
document.getElementById('buscaGeral').addEventListener('keyup', carregarProtocolos);
document.getElementById('form-cnpj').addEventListener('input', function (e) {
    let valor = e.target.value.replace(/\D/g, '');
    
    if (valor.length > 14) valor = valor.slice(0, 14); 
    
    valor = valor.replace(/^(\d{2})(\d)/, '$1.$2');
    valor = valor.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
    valor = valor.replace(/\.(\d{3})(\d)/, '.$1/$2');
    valor = valor.replace(/(\d{4})(\d)/, '$1-$2');
    
    e.target.value = valor;
});
inicializar();