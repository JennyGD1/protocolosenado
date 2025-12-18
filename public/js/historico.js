const token = localStorage.getItem('maida_token');
let paginaAtual = 1;
let totalPaginas = 1;

if (!token) window.location.href = '/';

async function inicializar() {
    try {
        const response = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error();
        const user = await response.json();
        document.getElementById('user-display').innerText = user.email;

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

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    // ÍCONES SVG CORRIGIDOS
    const iconPhone = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
    const iconMail = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;

    dados.forEach(p => {
        const dataFormatada = new Date(p.data_registro).toLocaleDateString('pt-BR') + ' ' + new Date(p.data_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const cnpjValor = p.cnpj || p.nu_cnpj || p.cpf_cnpj || "";
        const htmlCnpj = cnpjValor ? `<small style="color:#666; display:block;">${cnpjValor}</small>` : '';

        // Lógica para escolher o ícone (Telefone é o padrão se vier nulo)
        const canalIcone = p.canal === 'email' ? iconMail : iconPhone;
        const tituloCanal = p.canal === 'email' ? 'Email' : 'Telefone';

        const classeStatus = `status-${p.status.replace(/\s+/g, '-')}`;
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dataFormatada}</td>
            <td style="text-align:center;" title="${tituloCanal}">${canalIcone}</td>
            <td style="font-weight:bold;">${p.numero_protocolo}</td>
            <td style="text-transform: capitalize;">${p.tipo}</td>
            <td>${p.prestador}${htmlCnpj}</td>
            <td style="text-transform: capitalize;">${p.assunto}</td>
            <td><span class="status-badge ${classeStatus}">${p.status}</span></td>
            <td>${p.alerta_prazo || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
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
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const tipo = document.getElementById('filtroTipo').value;
    const assunto = document.getElementById('filtroAssunto').value;

    function formatarParaTitulo(texto) {
        if (!texto) return '';
        return texto.toLowerCase().split(' ').map(palavra => {
            return palavra.charAt(0).toUpperCase() + palavra.slice(1);
        }).join(' ');
    }

    let url = `/api/historico?page=1&limit=10000`;
    if (dataInicio) url += `&dataInicio=${dataInicio}`;
    if (dataFim) url += `&dataFim=${dataFim}`;
    if (tipo) url += `&tipo=${tipo}`;
    if (assunto) url += `&assunto=${assunto}`;

    try {
        const btn = event.currentTarget;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = 'Gerando...';
        btn.disabled = true;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const resultado = await res.json();
        const dados = resultado.data;

        if (!dados || dados.length === 0) {
            alert("Não há dados para exportar com os filtros atuais.");
            btn.innerHTML = originalHtml;
            btn.disabled = false;
            return;
        }

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Relatório de Protocolos');

        worksheet.columns = [
            { header: 'Data Registro', key: 'data', width: 20 },
            { header: 'Canal', key: 'canal', width: 15 },
            { header: 'Protocolo', key: 'protocolo', width: 25 },
            { header: 'Tipo', key: 'tipo', width: 15 },
            { header: 'Prestador', key: 'prestador', width: 30 },
            { header: 'CNPJ', key: 'cnpj', width: 20 },
            { header: 'Assunto', key: 'assunto', width: 35 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Prazo', key: 'prazo', width: 15 },
            { header: 'Data Fechamento', key: 'fechamento', width: 20 },
            { header: 'Tratativa', key: 'tratativa', width: 40 }
        ];

        dados.forEach(d => {
            const dataReg = new Date(d.data_registro).toLocaleString('pt-BR');
            const dataFech = d.data_fechamento ? new Date(d.data_fechamento).toLocaleString('pt-BR') : "-";
            const cnpj = d.cnpj || d.nu_cnpj || "";
            
            worksheet.addRow({
                data: dataReg,
                protocolo: d.numero_protocolo,
                canal: d.canal ? (d.canal.charAt(0).toUpperCase() + d.canal.slice(1)) : 'Telefone',
                tipo: formatarParaTitulo(d.tipo), 
                prestador: d.prestador,
                cnpj: cnpj,
                assunto: formatarParaTitulo(d.assunto), 
                status: d.status ? d.status.toUpperCase() : '',
                prazo: d.alerta_prazo,
                fechamento: dataFech,
                tratativa: d.tratativa || ""
            });
        });

        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell) => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '0066CC' }
            };
            cell.font = {
                color: { argb: 'FFFFFF' },
                bold: true,
                size: 12
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });
        headerRow.height = 25;

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                row.eachCell((cell, colNumber) => {
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }, color: { argb: 'CCCCCC' } };
                    
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };

                    if (colNumber === 8) { // Ajustado índice da coluna Status (agora é a 8ª)
                        const val = cell.value;
                        if (val === 'ABERTO') cell.font = { color: { argb: 'D32F2F' }, bold: true };
                        if (val === 'RESOLVIDO') cell.font = { color: { argb: '388E3C' }, bold: true };
                        if (val === 'EM ANDAMENTO') cell.font = { color: { argb: 'F57F17' }, bold: true };
                    }
                });
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        saveAs(blob, `Relatorio_Protocolos_${new Date().toISOString().slice(0,10)}.xlsx`);

        btn.innerHTML = originalHtml;
        btn.disabled = false;

    } catch (error) {
        console.error("Erro Excel:", error);
        alert("Erro ao gerar Excel.");
        const btn = document.querySelector('button[title="Baixar Excel"]');
        if(btn) {
            btn.innerHTML = originalHtml || '<svg...></svg>';
            btn.disabled = false;
        }
    }
}

function mudarPagina(delta) {
    const novaPagina = paginaAtual + delta;
    if (novaPagina > 0 && novaPagina <= totalPaginas) {
        paginaAtual = novaPagina;
        buscarHistorico();
    }
}

function logout() {
    localStorage.clear();
    window.location.href = '/';
}

inicializar();