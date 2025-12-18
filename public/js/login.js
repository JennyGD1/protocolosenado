
async function iniciarFirebase() {
    try {
        const res = await fetch('/api/firebase-config');
        const config = await res.json();
        if (!firebase.apps.length) {
            firebase.initializeApp(config);
        }


        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                await validarEAutenticar(user);
            }
        });
    } catch (error) {
        console.error("Erro ao carregar configurações do Firebase:", error);
    }
}


document.addEventListener('DOMContentLoaded', iniciarFirebase);

function fazerLoginGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    

    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = 'flex';

    firebase.auth().signInWithPopup(provider)
        .then(async (result) => {
            await validarEAutenticar(result.user);
        })
        .catch((error) => {
            if (loader) loader.style.display = 'none';
            console.error("Erro no login:", error);
            exibirModal('Falha no Login', "Não foi possível autenticar com o Google.");
        });
}

async function validarEAutenticar(user) {
    try {
        const token = await user.getIdToken();
        


        const response = await fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const userData = await response.json();
            

            localStorage.setItem('maida_token', token);
            localStorage.setItem('maida_user_email', userData.email);
            localStorage.setItem('maida_user_role', userData.role);


            window.location.href = '/protocolos';
        } else {

            await firebase.auth().signOut();
            localStorage.clear();
            const msg = await response.text();
            exibirModal('Acesso Negado', "Este e-mail não tem permissão para acessar o sistema.");
            document.getElementById('loading-overlay').style.display = 'none';
        }
    } catch (error) {
        console.error("Erro na validação:", error);
        document.getElementById('loading-overlay').style.display = 'none';
    }
}


function exibirModal(titulo, mensagem) {
    const modal = document.getElementById('modalSistema');
    if (!modal) {
        alert(mensagem);
        return;
    }
    document.getElementById('modalTitulo').innerText = titulo || 'Aviso';
    document.getElementById('modalMensagem').innerText = mensagem;
    const btnContainer = document.getElementById('modalBotoes');
    btnContainer.innerHTML = '<button class="btn-modal-custom btn-confirm-custom" onclick="fecharModal()">Entendido</button>';
    modal.style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalSistema').style.display = 'none';
}

function logout() {
    firebase.auth().signOut().then(() => {
        localStorage.clear();
        window.location.href = 'login.html';
    });
}