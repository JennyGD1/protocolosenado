const token = localStorage.getItem('maida_token');
let paginaAtual = 1;
let totalPaginas = 1;
let dadosAtuais = [];

if (!token) window.location.href = '/';

async function inicializar() {
    try {
        const response = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error();
        const user = await response.json();
        document.getElementById('user-display').innerText = user.email;

        if (user.role === 'restrito') {
            bloquearInterfaceRestrita();
            return;
        }

        buscarHistorico();

    } catch (e) {
        logout();
    }
}

async function buscarHistorico() {
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const tipo = document.getElementById('filtroTipo').value;
    const assunto = document.getElementById('filtroAssunto').value;

    let url = `/api/historico?page=${paginaAtual}&limit=10`;
    if (dataInicio) url += `&dataInicio=${dataInicio}`;
    if (dataFim) url += `&dataFim=${dataFim}`;
    if (tipo) url += `&tipo=${tipo}`;
    if (assunto) url += `&assunto=${assunto}`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const resultado = await res.json();

        // SALVA OS DADOS PARA USAR NO MODAL DEPOIS
        dadosAtuais = resultado.data || [];

        totalPaginas = resultado.totalPages;
        document.getElementById('infoPaginacao').innerText = `Página ${resultado.page} de ${resultado.totalPages || 1}`;
        document.getElementById('btnAnterior').disabled = resultado.page <= 1;
        document.getElementById('btnProximo').disabled = resultado.page >= totalPaginas;

        renderizarTabela(resultado.data);

    } catch (error) {
        console.error(error);
        alert('Erro ao carregar histórico.');
    }
}

function renderizarTabela(dados) {
    const tbody = document.getElementById('listaHistorico');
    tbody.innerHTML = '';

    if (!dados || dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    const iconPhone = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
    const iconMail = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;

    dados.forEach(p => {
        const dataFormatada = new Date(p.data_registro).toLocaleDateString('pt-BR') + ' ' + new Date(p.data_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const cnpjValor = p.cnpj || p.nu_cnpj || p.cpf_cnpj || "";
        const htmlCnpj = cnpjValor ? `<small style="color:#666; display:block;">${cnpjValor}</small>` : '';
        const canalIcone = p.canal === 'email' ? iconMail : iconPhone;
        const tituloCanal = p.canal === 'email' ? 'Email' : 'Telefone';
        const classeStatus = `status-${p.status.replace(/\s+/g, '-')}`;
        
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td style="text-align:center;" title="${tituloCanal}">${canalIcone}</td>
            <td style="font-weight:bold;">${p.numero_protocolo}</td>
            <td style="text-transform: capitalize;">${p.tipo}</td>
            <td>${p.demandante || '-'}</td>
            <td>${p.prestador}${htmlCnpj}</td>
            <td style="text-transform: capitalize;">${p.assunto}</td>
            <td><span class="status-badge ${classeStatus}">${p.status}</span></td>
            <td style="text-align: center;">
                <button class="btn-acao btn-detalhes" onclick="verDetalhes(${p.id})" title="Ver Detalhes">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
async function verDetalhes(id) {
    const modal = document.getElementById('modalVisualizar');
    
    const protocolo = dadosAtuais.find(p => p.id === id);
    
    if (protocolo) {
        const assuntoFormatado = protocolo.assunto 
            ? protocolo.assunto.charAt(0).toUpperCase() + protocolo.assunto.slice(1) 
            : '';

        document.getElementById('detalheProtocolo').innerText = `${protocolo.numero_protocolo} - ${assuntoFormatado}`;
    } else {
        document.getElementById('detalheProtocolo').innerText = "Carregando...";
    }

    document.getElementById('detalheTratativa').value = "";
    document.getElementById('detalheHistorico').innerHTML = "Carregando histórico...";
    
    modal.style.display = 'flex';

    try {
        const resMov = await fetch(`/api/protocolos/${id}/movimentacoes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const movimentacoes = await resMov.json();
        
        exibirHistorico(movimentacoes);

    } catch (error) {
        console.error(error);
        document.getElementById('detalheHistorico').innerText = "Erro ao carregar detalhes.";
    }
}
function exibirHistorico(movimentacoes) {
    const container = document.getElementById('detalheHistorico');
    const txtTratativa = document.getElementById('detalheTratativa');
    const divResolvido = document.getElementById('detalheResolvidoPor');

    if (!movimentacoes || movimentacoes.length === 0) return;

    const ultimaAcao = movimentacoes[0];
    const abertura = movimentacoes[movimentacoes.length - 1];
    if (ultimaAcao.secretaria_destino === 'Finalizado' || ultimaAcao.secretaria_destino === 'Resolvido Imediato') {
        txtTratativa.value = ultimaAcao.observacao;
    } else {
        txtTratativa.value = "Protocolo ainda em andamento...";
    }
    
    if (!movimentacoes || movimentacoes.length === 0) {
        container.innerHTML = '<p style="padding:10px; color:#777;">Nenhuma movimentação.</p>';
        return;
    }

    const ultima = movimentacoes[0];
    if (ultima.secretaria_destino === 'Finalizado' || ultima.secretaria_destino === 'Resolvido Imediato') {
         txtTratativa.value = ultima.observacao;
         divResolvido.innerHTML = `<strong>Resolvido por:</strong> ${ultima.usuario_responsavel} em ${ultima.data_formatada}`;
    } else {
         txtTratativa.value = "Em andamento...";
         divResolvido.innerHTML = "";
    }

    const html = movimentacoes.map(m => {
    const isResolvido = m.secretaria_destino === 'Finalizado' || m.secretaria_destino === 'Resolvido Imediato';
    
    const textoFormatado = (m.observacao || 'Sem observação')
        .replace(/(Abertura\/Relato:|Tratativa Final:|Solução Final:|Encaminhamento:)/g, '<strong>$1</strong>');

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

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
}

function aplicarFiltros() {
    paginaAtual = 1;
    buscarHistorico();
}

function limparFiltros() {
    document.getElementById('dataInicio').value = '';
    document.getElementById('dataFim').value = '';
    document.getElementById('filtroTipo').value = '';
    document.getElementById('filtroAssunto').value = '';
    aplicarFiltros();
}

async function baixarExcel() {
    try {
        const res = await fetch('/api/exportar-protocolos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Erro ao baixar');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Relatorio_Protocolos_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
    } catch (error) {
        console.error(error);
        alert("Não foi possível gerar a planilha no momento.");
    }
}

function mudarPagina(delta) {
    const novaPagina = paginaAtual + delta;
    if (novaPagina > 0 && novaPagina <= totalPaginas) {
        paginaAtual = novaPagina;
        buscarHistorico();
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
                <p style="color: #666; font-size: 1.1rem;">Você não tem permissão para visualizar o Histórico.</p>
                <p style="color: #666; margin-top: 10px;">Solicite acesso ao administrador.</p>
            </div>
        `;
    }
}

function logout() {
    localStorage.clear();
    window.location.href = '/';
}

inicializar();