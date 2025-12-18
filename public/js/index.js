const token = localStorage.getItem('maida_token');
let userRole = 'guest';
let filtroStatusAtual = null;
let listaProtocolosAtual = []; // Variável para armazenar dados e usar no modal de detalhes

if (!token) window.location.href = '/';

async function inicializar() {
    const hoje = new Date().toISOString().split('T')[0];
    document.getElementById('filtroData').value = hoje;

    try {
        const response = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error();

        const user = await response.json();
        userRole = user.role;
        document.getElementById('user-display').innerText = user.email;

        if (userRole === 'cliente') {
            const btnNovo = document.getElementById('btnNovoProtocolo');
            if(btnNovo) btnNovo.style.display = 'none';
        }

        carregarProtocolos();
    } catch (e) {
        logout();
    }
}

async function carregarProtocolos() {
    const dataFiltro = document.getElementById('filtroData').value;
    const termoBusca = document.getElementById('buscaGeral').value.toLowerCase();

    try {
        const res = await fetch(`/api/protocolos?data=${dataFiltro}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        let dados = await res.json();
        listaProtocolosAtual = dados; // Salva para uso nos modais

        if (termoBusca) {
            dados = dados.filter(p => 
                (p.numero_protocolo && p.numero_protocolo.toLowerCase().includes(termoBusca)) ||
                (p.prestador && p.prestador.toLowerCase().includes(termoBusca)) ||
                (p.demandante && p.demandante.toLowerCase().includes(termoBusca)) ||
                (p.assunto && p.assunto.toLowerCase().includes(termoBusca))
            );
        }


        const total = dados.length;
        const abertos = dados.filter(p => p.status === 'aberto').length;
        const andamento = dados.filter(p => p.status === 'em andamento').length;
        const resolvido = dados.filter(p => p.status === 'resolvido').length;

        document.getElementById('count-total').innerText = total;
        document.getElementById('count-aberto').innerText = abertos;
        document.getElementById('count-andamento').innerText = andamento;
        document.getElementById('count-resolvido').innerText = resolvido;

        const tbody = document.getElementById('listaProtocolos');
        tbody.innerHTML = '';

        if (dados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px; color: #666;">Nenhum protocolo encontrado.</td></tr>';
            return;
        }

        dados.forEach(p => {
            if (filtroStatusAtual && p.status !== filtroStatusAtual) return;

            const hora = new Date(p.data_registro).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });


            const iconPhone = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
            const iconMail = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
            const canalIcone = p.canal === 'email' ? iconMail : iconPhone;

            const cnpjValor = p.cnpj ? p.cnpj : (p.nu_cnpj || ""); 
            const htmlCnpj = cnpjValor ? `<small style="color:#777; display:block; font-size:0.75rem;">${cnpjValor}</small>` : '';
            

            const htmlDemandante = p.demandante ? `<div style="font-size:0.8rem; color:#0066cc; margin-top:2px;">Solicitante: ${p.demandante}</div>` : '';

            let htmlStatus;
            let htmlAcao;


            if (p.status === 'resolvido' || userRole === 'cliente') {

                htmlStatus = `<span class="status-badge status-${p.status.replace(/\s+/g, '-')}" style="display:inline-block; padding: 6px 12px; font-size: 0.8rem;">${p.status.toUpperCase()}</span>`;
                

                htmlAcao = `
                    <button class="btn-icon" onclick="verDetalhes(${p.id})" title="Ver Detalhes">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0066cc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                `;
            } else {

                const classeSelect = p.status === 'aberto' ? 'status-aberto' : 'status-em-andamento';
                
                htmlStatus = `
                    <select onchange="alterarStatusDireto(${p.id}, this.value)" class="status-select ${classeSelect}">
                        <option value="aberto" ${p.status === 'aberto' ? 'selected' : ''}>ABERTO</option>
                        <option value="em andamento" ${p.status === 'em andamento' ? 'selected' : ''}>EM ANDAMENTO</option>
                        <option value="resolvido" ${p.status === 'resolvido' ? 'selected' : ''}>RESOLVIDO</option>
                    </select>
                `;


                htmlAcao = `
                    <button class="btn-icon btn-resolver" onclick="abrirModalResolver(${p.id})" title="Resolver">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0066cc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                `;
            }

            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td>${hora}</td>
                <td style="text-align:center;">${canalIcone}</td>
                <td style="font-weight:bold;">${p.numero_protocolo}</td>
                <td style="text-transform: capitalize;">${p.tipo}</td>
                <td>
                    ${p.prestador || 'Não inf.'}<br>
                    ${htmlCnpj}
                    ${htmlDemandante} </td>
                <td style="text-transform: capitalize;">${p.assunto}</td>
                <td>${htmlStatus}</td>
                <td style="text-align:center;">${htmlAcao}</td>
            `;
            tbody.appendChild(tr);
        });

    } catch (error) {
        console.error("Erro ao carregar:", error);
    }
}




function verDetalhes(id) {
    const p = listaProtocolosAtual.find(item => item.id === id);
    if (!p) return;

    document.getElementById('view-protocolo').innerText = p.numero_protocolo;
    document.getElementById('view-tratativa').innerText = p.tratativa || "Nenhuma resolução registrada.";
    document.getElementById('view-responsavel').innerText = p.email_tratativa || "-";
    
    const dataFech = p.data_fechamento ? new Date(p.data_fechamento).toLocaleString('pt-BR') : "-";
    document.getElementById('view-data').innerText = dataFech;

    document.getElementById('modalVisualizar').style.display = 'flex';
}

async function alterarStatusDireto(id, novoStatus) {
    if (novoStatus === 'resolvido') {
        abrirModalResolver(id);
        carregarProtocolos(); 
        return; 
    }
    try {
        await fetch(`/api/protocolos/${id}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ 
                status: novoStatus, 
                tratativa: `Status alterado manualmente para ${novoStatus}` 
            })
        });
        carregarProtocolos(); 
    } catch (e) {
        alert("Erro ao atualizar status");
    }
}

let idEmResolucao = null;
function abrirModalResolver(id) {
    idEmResolucao = id;
    document.getElementById('resolucao-texto').value = ''; 
    document.getElementById('modalResolver').style.display = 'flex';
}

async function confirmarResolucao() {
    if(!idEmResolucao) return;
    const textoResolucao = document.getElementById('resolucao-texto').value;
    if(!textoResolucao.trim()) {
        alert("Por favor, descreva a solução para finalizar o protocolo.");
        return;
    }
    try {
        const btn = document.getElementById('btnConfirmarResolucao');
        btn.innerText = "Finalizando...";
        btn.disabled = true;

        const res = await fetch(`/api/protocolos/${idEmResolucao}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ status: 'resolvido', tratativa: textoResolucao })
        });

        if (res.ok) {
            fecharModal('modalResolver'); 
            carregarProtocolos();         
            document.getElementById('modalSucessoFechamento').style.display = 'flex';
        } else {
            alert("Erro ao finalizar protocolo.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro de conexão ao resolver protocolo");
    } finally {
        const btn = document.getElementById('btnConfirmarResolucao');
        if(btn) { btn.innerText = "Confirmar Resolução"; btn.disabled = false; }
    }
}

async function salvarProtocolo() {
    const numero = document.getElementById('form-numero').value;
    const tipo = document.getElementById('form-tipo').value;
    const prestador = document.getElementById('form-prestador').value;
    const cnpj = document.getElementById('form-cnpj').value;
    const assunto = document.getElementById('form-assunto').value;
    const observacao = document.getElementById('form-obs').value;
    const canal = document.getElementById('form-canal').value;
    const demandante = document.getElementById('form-demandante').value;

    if (!numero || numero === 'Gerando...' || !prestador || !assunto) {
        alert("Preencha os campos obrigatórios e aguarde o número.");
        return;
    }

    const payload = { numero, tipo, prestador, cnpj, assunto, observacao, canal, demandante };

    try {
        const btnSalvar = document.querySelector('#modalNovo .btn-confirm-custom');
        btnSalvar.innerText = "Salvando...";
        btnSalvar.disabled = true;

        const res = await fetch('/api/protocolos', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            fecharModal('modalNovo');
            document.getElementById('texto-protocolo-criado').innerText = numero;
            document.getElementById('modalSucesso').style.display = 'flex';
            carregarProtocolos();
            
            document.getElementById('form-numero').value = '';
            document.getElementById('form-prestador').value = '';
            document.getElementById('form-cnpj').value = '';
            document.getElementById('form-demandante').value = '';
            document.getElementById('form-assunto').value = '';
            document.getElementById('form-obs').value = '';
        } else {
            const erro = await res.json();
            alert(erro.error || "Erro ao salvar.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro de conexão.");
    } finally {
        const btnSalvar = document.querySelector('#modalNovo .btn-confirm-custom');
        if(btnSalvar) { btnSalvar.innerText = "Confirmar Registro"; btnSalvar.disabled = false; }
    }
}

function selecionarCanal(tipo) {
    document.getElementById('btn-canal-telefone').classList.remove('active');
    document.getElementById('btn-canal-email').classList.remove('active');
    document.getElementById(`btn-canal-${tipo}`).classList.add('active');
    document.getElementById('form-canal').value = tipo;
}

function filtrarStatus(status) {
    filtroStatusAtual = status;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    if (status === null) document.getElementById('card-total-box').classList.add('active');
    else if (status === 'aberto') document.getElementById('card-aberto-box').classList.add('active');
    else if (status === 'em andamento') document.getElementById('card-andamento-box').classList.add('active');
    else if (status === 'resolvido') document.getElementById('card-resolvido-box').classList.add('active');
    carregarProtocolos();
}

async function abrirModalNovo() {
    document.getElementById('modalNovo').style.display = 'flex';
    const inputNumero = document.getElementById('form-numero');
    inputNumero.value = "Gerando...";
    inputNumero.disabled = true;
    try {
        const res = await fetch('/api/proximo-protocolo', { headers: { 'Authorization': `Bearer ${token}` } });
        if (res.ok) {
            const data = await res.json();
            inputNumero.value = data.protocolo;
        } else {
            inputNumero.value = ""; inputNumero.placeholder = "Erro ao gerar.";
        }
    } catch (error) { inputNumero.value = "Erro de conexão"; }
}

function fecharModal(id) { document.getElementById(id).style.display = 'none'; }
function logout() { localStorage.clear(); window.location.href = '/'; }

document.getElementById('filtroData').addEventListener('change', carregarProtocolos);
document.getElementById('buscaGeral').addEventListener('keyup', carregarProtocolos);

inicializar();