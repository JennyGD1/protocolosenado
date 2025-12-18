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
                    pointRadius: 5, // Ponto maior para caber o número perto
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
            layout: { padding: { top: 20 } }, // Espaço para o número não cortar
            plugins: { 
                legend: { position: 'top', align: 'end' },

                datalabels: {
                    align: 'top',
                    anchor: 'center',
                    backgroundColor: 'white',
                    borderRadius: 4,
                    color: (ctx) => ctx.dataset.borderColor, // Cor igual a da linha
                    font: { weight: 'bold', size: 11 },
                    formatter: (value) => value > 0 ? value : '' // Só mostra se > 0
                }
            },
            scales: { 
                y: { 
                    display: false, // Remove legenda numérica vertical
                    grid: { display: false } // Remove grade
                }, 
                x: { 
                    grid: { display: false } // Remove grade
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
            indexAxis: 'y', // Horizontal
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { right: 50 } }, // Espaço para o texto
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
                x: { display: false, grid: { display: false } }, // Remove eixo X e grade
                y: { grid: { display: false } } // Remove grade Y
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
        type: 'bar', // Vertical padrão
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
            layout: { padding: { top: 25 } }, // Espaço para o número no topo
            plugins: { 
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'end', // Fica em cima da coluna
                    color: '#333',
                    font: { weight: 'bold' },
                    formatter: (value) => {
                        if(totalGeral === 0) return '0';
                        const pct = ((value / totalGeral) * 100).toFixed(0);
                        return `${value}\n(${pct}%)`; // Quebra linha
                    }
                }
            },
            scales: { 
                y: { display: false, grid: { display: false } }, // Remove eixo Y e grade
                x: { grid: { display: false } } // Remove grade X
            }
        }
    });
}

function logout() {
    localStorage.clear();
    window.location.href = '/';
}

inicializar();