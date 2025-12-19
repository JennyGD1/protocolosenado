const token = localStorage.getItem('maida_token');


Chart.register(ChartDataLabels);

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

        carregarGraficos();

    } catch (e) {
        logout();
    }
}

async function carregarGraficos() {
    try {
        const res = await fetch('/api/dashboard-dados', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const dados = await res.json();

        renderizarLinha(dados.graficoLinha);
        renderizarBarrasHorizontal('chartAbertura', dados.rankingAbertura, 'Abertos', '#0066cc');
        renderizarBarrasHorizontal('chartTratativa', dados.rankingTratativa, 'Resolvidos', '#28a745');

        renderizarColunasAssuntos('chartAssuntos', dados.rankingAssuntos);

    } catch (error) {
        console.error("Erro dashboard:", error);
    }
}


function renderizarLinha(dados) {
    const ctx = document.getElementById('chartLinha').getContext('2d');
    const dias = [...new Set(dados.map(d => d.dia))];
    
    const getDados = (tipo) => dias.map(dia => {
        const item = dados.find(d => d.dia === dia && d.tipo === tipo);
        return item ? parseInt(item.total) : 0;
    });

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: dias,
            datasets: [
                {
                    label: 'Solicitação',
                    data: getDados('solicitação'),
                    borderColor: '#0066cc',
                    backgroundColor: '#0066cc',
                    tension: 0.3, 
                    fill: false,
                    pointRadius: 5, 
                    pointHoverRadius: 7
                },
                {
                    label: 'Informação',
                    data: getDados('informação'),
                    borderColor: '#fbc02d',
                    backgroundColor: '#fbc02d',
                    tension: 0.3, 
                    fill: false,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'Reclamação',
                    data: getDados('reclamação'),
                    borderColor: '#d32f2f',
                    backgroundColor: '#d32f2f',
                    tension: 0.3, 
                    fill: false,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20 } }, 
            plugins: { 
                legend: { position: 'top', align: 'end' },

                datalabels: {
                    align: 'top',
                    anchor: 'center',
                    backgroundColor: 'white',
                    borderRadius: 4,
                    color: (ctx) => ctx.dataset.borderColor,
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value > 0 ? value : '' 
                }
            },
            scales: { 
                y: { 
                    display: false, 
                    grid: { display: false } 
                }, 
                x: { 
                    grid: { display: false }
                } 
            }
        }
    });
}


function renderizarBarrasHorizontal(id, dados, label, cor) {
    const ctx = document.getElementById(id).getContext('2d');
    const labels = dados.map(d => d.email ? d.email.split('@')[0] : 'Sistema');
    const valores = dados.map(d => parseInt(d.total));
    

    const totalGeral = valores.reduce((a, b) => a + b, 0);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: valores,
                backgroundColor: cor,
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 50 } }, 
            plugins: { 
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end',
                    color: '#333',
                    font: { weight: 'bold' },
                    formatter: (value) => {
                        if(totalGeral === 0) return '0';
                        const pct = ((value / totalGeral) * 100).toFixed(0);
                        return `${value} (${pct}%)`;
                    }
                }
            },
            scales: { 
                x: { display: false, grid: { display: false } }, 
                y: { grid: { display: false } }
            }
        }
    });
}


function renderizarColunasAssuntos(id, dados) {
    const ctx = document.getElementById(id).getContext('2d');
    

    const top5 = dados.slice(0, 5);
    const labels = top5.map(d => d.assunto);
    const valores = top5.map(d => parseInt(d.total));
    const totalGeral = valores.reduce((a, b) => a + b, 0);

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ocorrências',
                data: valores,

                backgroundColor: ['#0066cc', '#28a745', '#fbc02d', '#d32f2f', '#6c757d'],
                borderRadius: 4,
                barPercentage: 0.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 25 } }, 
            plugins: { 
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end', 
                    color: '#333',
                    font: { weight: 'bold' },
                    formatter: (value) => {
                        if(totalGeral === 0) return '0';
                        const pct = ((value / totalGeral) * 100).toFixed(0);
                        return `${value}\n(${pct}%)`; 
                    }
                }
            },
            scales: { 
                y: { display: false, grid: { display: false } }, 
                x: { grid: { display: false } } 
            }
        }
    });
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
                <p style="color: #666; font-size: 1.1rem;">Você não tem permissão para visualizar o Dashboard.</p>
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