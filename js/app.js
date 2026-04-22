const app = {
  user: null,
  userDoc: null,
  currentMonth: new Date().getMonth() + 1,
  currentYear: new Date().getFullYear(),
  currentFilter: 'ALL',
  currentScope: 'PERSONAL', // Ou 'FAMILY'
  chartInstance: null,
  categories: [],
  db: null,
  auth: null,

  init() {
    setTimeout(() => {
      document.getElementById('loader').style.opacity = '0';
      setTimeout(() => document.getElementById('loader').style.display = 'none', 500);
    }, 800);

    // Conectar instâncias do Firebase
    try {
      if (!firebase.apps.length) {
        this.toast('Firebase não inicializado corretamente. Verifique o config.', 'error');
        return;
      }
      this.db = firebase.firestore();
      
      // MÁGICA ANTI-BLOQUEIO: Apenas para arquivos locais (file://)
      if (window.location.protocol === 'file:') {
        this.db.settings({ experimentalForceLongPolling: true });
      }

      // FORÇAR REDE: Garante que o Firestore tente se conectar mesmo se o browser achar que está offline
      this.db.enableNetwork().catch(() => {});
      
      this.auth = firebase.auth();
      this.setupAuthListener();
    } catch(e) {
      console.error("Firebase Init Error:", e);
      this.toast('Erro ao conectar ao Firebase: ' + e.message, 'error');
    }
  },

  toast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  },

  setupAuthListener() {
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          // Usuário logado no firebase auth
          this.user = user;
          
          // Puxar cadastro do banco para ver Role e se está aprovado
          const docRef = await this.db.collection('users').doc(user.uid).get();
          if(docRef.exists) {
            this.userDoc = docRef.data();
            // Migração: garantir que family_id existe
            if(!this.userDoc.family_id) {
               this.userDoc.family_id = user.uid; // Por padrão, a família é ele mesmo
               await this.db.collection('users').doc(user.uid).update({ family_id: user.uid });
            }

            if(this.userDoc.approved === false) {
               this.auth.signOut();
               this.toast('Sua conta ainda não foi aprovada.', 'error');
               this.switchAuthMode('login');
            } else {
               this.setupDashboard();
            }
          } else {
            // Conta fantasma ou primeira vez (Recuperação)
            const nomeMascara = user.email.split('@')[0].toUpperCase();
            const userData = {
              name: nomeMascara,
              email: user.email,
              role: 'ADMIN',
              approved: true,
              family_id: user.uid, // Inicializa com o próprio UID
              created_at: firebase.firestore.FieldValue.serverTimestamp()
            };
            await this.db.collection('users').doc(user.uid).set(userData);
            this.userDoc = userData;
            this.toast('Conta super Admin sincronizada!', 'success');
            this.setupDashboard();
          }
        } catch (err) {
          console.error(err);
          this.toast('ERRO GRAVE NO BANCO DE DADOS: ' + err.message, 'error');
          // Forçar entrada mesmo que o banco exploda pra não travar a tela
          this.userDoc = { name: user.email.split('@')[0], role: 'USER' };
          this.setupDashboard();
        }
      } else {
        // Deslogado
        this.user = null;
        this.userDoc = null;
        document.getElementById('dashboard-view').classList.add('hidden');
        document.getElementById('auth-view').classList.remove('hidden');
      }
    });
  },

  switchAuthMode(mode) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${mode}`).classList.add('active');
    if (mode === 'login') {
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('register-form').classList.add('hidden');
    } else {
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('register-form').classList.remove('hidden');
    }
  },

  async handleRegister(e) {
    e.preventDefault();
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
      // Cria autenticação no Firebase
      const cred = await this.auth.createUserWithEmailAndPassword(email, password);
      
      // CHECAGEM MÁGICA: Existe algum Administrador Supremo já na nuvem? Se não existir, a nova conta vira a Dona de tudo automaticamente!
      const verifySnap = await this.db.collection('users').where('role', '==', 'ADMIN').limit(1).get();
      const isSuperAdmin = verifySnap.empty;
      
      // Salva o perfil no Firestore
      await this.db.collection('users').doc(cred.user.uid).set({
        name: name,
        email: email,
        role: isSuperAdmin ? 'ADMIN' : 'USER',
        approved: true, // Liberação total do App pra todos pedida pela Karine
        family_id: cred.user.uid, // Cada um começa com sua própria família individual
        created_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      this.toast('Conta criada com sucesso! Direcionando pro LisFinance...', 'success');
      const docRef = await this.db.collection('users').doc(cred.user.uid).get();
      this.userDoc = docRef.data();
      this.setupDashboard();
      
    } catch (e) {
      if(e.code === 'auth/email-already-in-use') {
         // Gambiarra pra ajudar a Karine com o erro recorrente:
         // Se disser que já existe, vamos forçar a entrar com esse e-mail direto no login pra ela!
         this.toast('O e-mail foi salvo anteriormente e já existe lá. Se travou, basta usar a aba ENTRAR.', 'error');
      } else if(e.code === 'auth/weak-password') {
         this.toast('Senha muito fraca, digite ao menos 6 letras/números', 'error');
      } else {
         this.toast(e.message, 'error');
      }
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
      await this.auth.signInWithEmailAndPassword(email, password);
      this.toast('Bem-vindo(a) ao LisFinance!');
    } catch (e) {
      this.toast('Email ou Senha inválidos.', 'error');
    }
  },

  logout() {
    if(this.auth) this.auth.signOut();
  },

  toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
      sidebar.classList.remove('open');
      overlay.classList.remove('active');
    } else {
      sidebar.classList.add('open');
      overlay.classList.add('active');
    }
  },

  closeSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  },

  openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('active');
    // Preencher data de hoje no campo de data se estiver vazio
    const dateInput = modal.querySelector('input[type="date"]');
    if(dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    // Limpar ID oculto para modo criação
    const hiddenId = modal.querySelector('input[type="hidden"]');
    if(hiddenId) hiddenId.value = '';
    // Atualizar categorias no select
    this.updateCategoryOptions();
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('active');
  },

  /* --- DASHBOARD SETUP & NAV --- */
  async setupDashboard() {
    document.getElementById('auth-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    
    document.getElementById('user-name-display').textContent = this.userDoc.name;
    document.getElementById('user-role-display').textContent = this.userDoc.role === 'ADMIN' ? 'Admin Geral' : 'Membro Familiar';
    document.getElementById('user-avatar').textContent = this.userDoc.name.charAt(0).toUpperCase();

    // O painel de ADMIN no menu agora aparece para todos (para gerenciar categorias),
    // mas o conteúdo interno mudará conforme o Role.
    document.getElementById('nav-item-admin').classList.remove('hidden');
    document.getElementById('mobile-nav-admin').classList.remove('hidden');

    this.updateMonthDisplay();
    await this.fetchCategories();
    this.navigate('dashboard'); 
  },

  navigate(pageId) {
    this.closeSidebar(); // fecha o menu no mobile ao navegar
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('.mobile-nav a').forEach(a => a.classList.remove('active'));
    
    document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`page-${pageId}`).classList.remove('hidden');
    
    if (pageId === 'dashboard') this.loadDashboard();
    if (pageId === 'transactions') {
      document.getElementById('transactions-filter').value = this.currentFilter;
      this.loadTransactions();
    }
    if (pageId === 'admin') this.loadAdmin();
    if (pageId === 'goals') this.loadGoals();
    if (pageId === 'profile') {
      document.getElementById('profile-name-edit').value = this.userDoc.name;
      document.getElementById('profile-email-edit').value = this.userDoc.email;
    }
  },

  setScope(scope) {
    this.currentScope = scope;
    if(scope === 'PERSONAL'){
      document.getElementById('scope-btn-personal').style.background = 'var(--primary)';
      document.getElementById('scope-btn-personal').style.color = 'white';
      document.getElementById('scope-btn-family').style.background = 'transparent';
      document.getElementById('scope-btn-family').style.color = 'var(--text-main)';
    } else {
      document.getElementById('scope-btn-family').style.background = 'var(--primary)';
      document.getElementById('scope-btn-family').style.color = 'white';
      document.getElementById('scope-btn-personal').style.background = 'transparent';
      document.getElementById('scope-btn-personal').style.color = 'var(--text-main)';
    }
    this.toast(scope === 'PERSONAL' ? 'Modo Pessoal ativado!' : 'Modo Família ativado!', 'success');
    
    const activePage = document.querySelector('.page-section:not(.hidden)').id;
    if (activePage === 'page-dashboard') this.loadDashboard();
    if (activePage === 'page-transactions') this.loadTransactions();
    if (activePage === 'page-goals') this.loadGoals();
  },

  goToFilteredTransactions(type) {
    this.currentFilter = type; // 'INCOME' ou 'EXPENSE'
    this.navigate('transactions');
  },

  applyFilter(type) {
    this.currentFilter = type;
    this.loadTransactions();
  },

  changeMonth(dir) {
    this.currentMonth += dir;
    if (this.currentMonth > 12) { this.currentMonth = 1; this.currentYear++; }
    if (this.currentMonth < 1) { this.currentMonth = 12; this.currentYear--; }
    this.updateMonthDisplay();
    
    const activePage = document.querySelector('.page-section:not(.hidden)').id;
    if (activePage === 'page-dashboard') this.loadDashboard();
    if (activePage === 'page-transactions') this.loadTransactions();
  },

  updateMonthDisplay() {
    const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    document.getElementById('current-month-display').textContent = `${months[this.currentMonth - 1]} ${this.currentYear}`;
  },

  toggleTheme() {
    document.body.classList.toggle('dark-theme');
    if (this.chartInstance) this.loadDashboard(); 
  },

  /* --- DATA FETCHING (FIREBASE) --- */
  async fetchCategories() {
    try {
      // 1. Buscar categorias personalizadas do usuário
      let snap = await this.db.collection('categories')
        .where('author_uid', '==', this.user.uid)
        .orderBy('name')
        .get();
      
      // 2. Se o usuário não tem nenhuma, vamos CLONAR as categorias globais/padrão para ele
      // Assim cada usuário tem sua própria lista independente desde o início!
      if (snap.empty) {
         this.toast('Preparando suas categorias personalizadas...', 'info');
         
         // Busca as categorias globais (antigas)
         const globalSnap = await this.db.collection('categories')
           .where('author_uid', '==', null)
           .get();
         
         const defaults = [
           { name: 'Trabalho / Salário', type: 'INCOME', color: '#10B981' },
           { name: 'Moradia / Contas', type: 'EXPENSE', color: '#6366F1' },
           { name: 'Alimentação / iFood', type: 'EXPENSE', color: '#EF4444' },
           { name: 'Lazer e Passeios', type: 'EXPENSE', color: '#8B5CF6' },
           { name: 'Transporte / Uber', type: 'EXPENSE', color: '#F59E0B' },
         ];

         // Se existirem globais, usa elas. Se não, usa o array 'defaults'.
         const source = !globalSnap.empty ? globalSnap.docs.map(d => d.data()) : defaults;

         for (const catData of source) {
           await this.db.collection('categories').add({
             ...catData,
             author_uid: this.user.uid
           });
         }
         
         // Recarrega para pegar a nova lista
         snap = await this.db.collection('categories')
           .where('author_uid', '==', this.user.uid)
           .orderBy('name')
           .get();
      }

      this.categories = [];
      snap.forEach(doc => {
         this.categories.push({ id: doc.id, ...doc.data() });
      });
    } catch(e) {
      console.error("Erro ao buscar categorias:", e);
    }
    this.updateCategoryOptions();
  },

  updateCategoryOptions() {
    const select = document.getElementById('trx-category');
    if (!select) return;
    
    // Categorias de emergência sempre disponíveis
    const fallback = [
      { id: 'cat-moradia', name: '🏠 Moradia / Contas', type: 'EXPENSE' },
      { id: 'cat-alimentacao', name: '🍔 Alimentação', type: 'EXPENSE' },
      { id: 'cat-lazer', name: '🎮 Lazer e Passeios', type: 'EXPENSE' },
      { id: 'cat-transporte', name: '🚗 Transporte', type: 'EXPENSE' },
      { id: 'cat-saude', name: '💊 Saúde', type: 'EXPENSE' },
      { id: 'cat-outros-exp', name: '📦 Outros', type: 'EXPENSE' },
      { id: 'cat-salario', name: '💰 Salário / Trabalho', type: 'INCOME' },
      { id: 'cat-freelance', name: '💻 Freelance', type: 'INCOME' },
      { id: 'cat-outros-inc', name: '✨ Outras Receitas', type: 'INCOME' },
    ];

    const source = (this.categories && this.categories.length > 0) ? this.categories : fallback;
    
    const typeEl = document.querySelector('input[name="trx-type"]:checked');
    const type = typeEl ? typeEl.value : 'EXPENSE';
    
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Selecione a categoria --</option>';
    
    source.filter(c => c.type === type).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      select.appendChild(opt);
    });
    
    // Restaurar valor selecionado se existir
    if (currentVal) select.value = currentVal;
  },


  async fetchMonthlyTransactions() {
    const monthStr = this.currentMonth.toString().padStart(2, '0');
    const startStr = `${this.currentYear}-${monthStr}-01`;
    const endStr = `${this.currentYear}-${monthStr}-31`; // Approx para cobrir o mês

    const snap = await this.db.collection('transactions')
      .where('date', '>=', startStr)
      .where('date', '<=', endStr)
      .orderBy('date', 'desc')
      .get();
      
    let results = [];
    snap.forEach(doc => {
       const data = doc.data();
       const ds = data.scope || 'PERSONAL';
       
       if (this.currentScope === 'PERSONAL') {
          if (ds === 'PERSONAL' && data.author_uid === this.user.uid) {
             results.push({ id: doc.id, ...data });
          }
       } else {
          // FAMILIA: Mostra apenas se o usuário pertencer à mesma família (family_id)
          if (ds === 'FAMILY' && data.family_id === this.userDoc.family_id) {
             results.push({ id: doc.id, ...data });
          }
       }
    });
    return results;
  },

  async loadDashboard() {
    try {
      const transactions = await this.fetchMonthlyTransactions();
      const formatCurr = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      let income = 0; let expense = 0;
      let pendingIncome = 0; let pendingExpense = 0;
      let expensesMap = {};

      transactions.forEach(t => {
        const amt = parseFloat(t.amount);
        const cat = this.categories.find(c => c.id === t.category_id);
        const cname = cat ? cat.name : 'Outros';
        const ccolor = cat ? cat.color : '#888';

        if (t.is_paid) {
          if (t.type === 'INCOME') income += amt;
          if (t.type === 'EXPENSE') {
            expense += amt;
            if (!expensesMap[cname]) expensesMap[cname] = { total: 0, color: ccolor };
            expensesMap[cname].total += amt;
          }
        } else {
          if (t.type === 'INCOME') pendingIncome += amt;
          if (t.type === 'EXPENSE') pendingExpense += amt;
        }
      });

      document.getElementById('summary-balance').textContent = formatCurr(income - expense);
      document.getElementById('summary-income').textContent = formatCurr(income);
      document.getElementById('summary-expense').textContent = formatCurr(expense);
      document.getElementById('summary-pending-expense').textContent = formatCurr(pendingExpense);
      document.getElementById('summary-pending-income').textContent = formatCurr(pendingIncome);

      this.renderChart(expensesMap);
      
      // Load upcoming bills
      const upcomingContainer = document.getElementById('upcoming-bills');
      upcomingContainer.innerHTML = '';
      const pendings = transactions.filter(t => t.is_paid === false).slice(0, 5);
      
      if (pendings.length === 0) upcomingContainer.innerHTML = '<div class="text-muted text-sm px-2">Navegando em maré mansa, tudo em dia!</div>';
      
      pendings.forEach(p => {
        upcomingContainer.innerHTML += `
          <div class="upcoming-item">
            <span>${p.description} <small class="text-muted">(${p.date.split('-').reverse().join('/')})</small></span>
            <strong class="${p.type === 'INCOME' ? 'text-success' : 'text-danger'}">${formatCurr(p.amount)}</strong>
          </div>
        `;
      });
    } catch (e) {
      console.error(e);
    }
  },

  renderChart(expensesMap) {
    if (this.chartInstance) this.chartInstance.destroy();
    
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const labels = Object.keys(expensesMap);
    const data = labels.map(l => expensesMap[l].total);
    const colors = labels.map(l => expensesMap[l].color);
    const isDark = document.body.classList.contains('dark-theme');

    if (labels.length === 0) {
      labels.push('Sem gastos'); data.push(1); colors.push(isDark ? '#1e293b' : '#e2e8f0');
    }

    this.chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: isDark ? '#f8fafc' : '#0f172a' } } },
        cutout: '75%'
      }
    });
  },

  async loadTransactions() {
    try {
      const txs = await this.fetchMonthlyTransactions();
      const tbody = document.getElementById('transactions-list');
      const empty = document.getElementById('transactions-empty');
      
      tbody.innerHTML = '';
      if (txs.length === 0) {
        empty.classList.remove('hidden');
      } else {
        empty.classList.add('hidden');
        // Aplica o filtro de tela antes de desenhar
        let filteredTxs = txs;
        if (this.currentFilter !== 'ALL') {
           filteredTxs = txs.filter(t => t.type === this.currentFilter);
        }

        if (filteredTxs.length === 0) {
           empty.classList.remove('hidden');
           return;
        }
        
        filteredTxs.forEach(t => {
          // Busca a categoria pelo ID ou tenta encontrar pelo nome se o ID não bater
          let cat = this.categories.find(c => c.id === t.category_id);
          
          if (!cat && t.category_id) {
             // TENTA O SEGUNDO MATCH: Se o t.category_id for um nome (ex: "Alimentação") ou um ID antigo (ex: "cat-moradia")
             // vamos comparar com o nome da categoria atual para tentar traduzir.
             cat = this.categories.find(c => 
               c.id.includes(t.category_id) || 
               t.category_id.includes(c.id) ||
               c.name.toLowerCase().includes(t.category_id.toLowerCase())
             );
          }
          
          const categoryName = cat ? cat.name : (t.category_id || 'Sem Categoria');
          const categoryColor = cat ? cat.color : '#888';

          const dateStr = t.date ? t.date.split('-').reverse().join('/') : '??/??/??';
          const amount = parseFloat(t.amount || 0);
          const amountStr = amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          
          const badge = t.is_paid 
            ? `<span class="badge paid" style="cursor:pointer" onclick="app.togglePaid('${t.id}', ${t.is_paid})" title="Clique para reverter para Pendente">Pago</span>`
            : `<span class="badge pending" style="cursor:pointer" onclick="app.togglePaid('${t.id}', ${t.is_paid})" title="Clique para dar baixa como Pago">Pendente</span>`;
          
          const amClass = t.type === 'INCOME' ? 'text-success' : '';
          const prefix = t.type === 'EXPENSE' ? '- ' : '+ ';
          
          let obsHtml = '';
          if (t.obs) obsHtml = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top:2px;">Obs: ${t.obs}</div>`;

          let fixoHtml = '';
          if (t.is_fixed) fixoHtml = `<small class="text-muted" style="display:block">Custo Fixo</small>`;

          tbody.innerHTML += `
            <tr>
              <td>${dateStr}</td>
              <td><strong>${t.description}</strong>${fixoHtml}${obsHtml}</td>
              <td><span style="color: ${categoryColor}">●</span> ${categoryName}</td>
              <td class="${amClass}"><strong>${prefix}${amountStr}</strong></td>
              <td>${badge}</td>
              <td class="col-actions">
                <button class="btn-icon" onclick="app.editModal('${t.id}')" title="Editar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                <button class="btn-icon" onclick="app.deleteTransaction('${t.id}')" title="Excluir"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--danger)" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
              </td>
            </tr>
          `;
        });
      }
    } catch (e) {}
  },

  /* --- TRANSACTION MODAL (FIREBASE) --- */
  openModal(id) {
    document.getElementById(id).classList.add('active');
    if(id === 'transaction-modal') {
      const today = new Date().toISOString().split('T')[0];
      if(!document.getElementById('trx-id').value) {
        document.getElementById('trx-date').value = today;
      }
      this.updateCategoryOptions();
    }
  },
  
  closeModal(id) {
    document.getElementById(id).classList.remove('active');
    if(id === 'transaction-modal') document.getElementById('transaction-form').reset();
    if(id === 'goal-modal') {
      document.getElementById('goal-form').reset();
      document.getElementById('goal-modal-title').textContent = 'Nova Meta';
    }
    const hiddenId = document.getElementById(id).querySelector('input[type="hidden"]');
    if(hiddenId) hiddenId.value = '';
  },

  async editModal(id) {
    // Buscar transaction do firestore pra preencher
    const doc = await this.db.collection('transactions').doc(id).get();
    if(doc.exists) {
      const t = doc.data();
      document.querySelector(`input[name="trx-type"][value="${t.type}"]`).checked = true;
      this.updateCategoryOptions();
      
      document.getElementById('trx-id').value = id;
      document.getElementById('trx-description').value = t.description;
      document.getElementById('trx-amount').value = t.amount;
      document.getElementById('trx-date').value = t.date;
      document.getElementById('trx-category').value = t.category_id;
      document.getElementById('trx-obs').value = t.obs || '';
      document.getElementById('trx-is-paid').checked = t.is_paid;
      document.getElementById('trx-is-fixed').checked = t.is_fixed;
      
      this.openModal('transaction-modal');
    }
  },

  async handleTransaction(e) {
    e.preventDefault();
    const id = document.getElementById('trx-id').value;
    const type = document.querySelector('input[name="trx-type"]:checked').value;
    const description = document.getElementById('trx-description').value;
    const amount = parseFloat(document.getElementById('trx-amount').value);
    const date = document.getElementById('trx-date').value;
    const category_id = document.getElementById('trx-category').value;
    const obs = document.getElementById('trx-obs').value;
    const is_paid = document.getElementById('trx-is-paid').checked;
    const is_fixed = document.getElementById('trx-is-fixed').checked;
    
    // Ler do Checkbox de escopo familiar. Se não der, assume o escopo atual.
    const isFamHTML = document.getElementById('trx-scope-family');
    const isFamily = isFamHTML ? isFamHTML.checked : (this.currentScope === 'FAMILY');

    const payload = { 
      type, description, amount, date, category_id, is_paid, is_fixed, obs,
      author_uid: this.user.uid,
      author_name: this.userDoc.name,
      scope: isFamily ? 'FAMILY' : 'PERSONAL',
      family_id: this.userDoc.family_id // Salva o family_id atual para transações compartilhadas
    };

    try {
      if (id) {
        await this.db.collection('transactions').doc(id).update(payload);
        this.toast('Transação atualizada no sistema nuvem');
      } else {
        payload.created_at = firebase.firestore.FieldValue.serverTimestamp();
        await this.db.collection('transactions').add(payload);
        this.toast('Transação salva com sucesso');
      }
    } catch (err) {
      console.error("Save Trx Error:", err);
      this.toast('Erro ao salvar: ' + (err.code || err.message), 'error');
    } finally {
      // FECHAMENTO GARANTIDO: Independente de erro ou sucesso, a tela precisa liberar
      this.closeModal('transaction-modal');
      e.target.reset();
      
      const activePage = document.querySelector('.page-section:not(.hidden)').id;
      if (activePage === 'page-dashboard') this.loadDashboard();
      if (activePage === 'page-transactions') this.loadTransactions();
    }
  },

  async deleteTransaction(id) {
    if(confirm('Certeza absoluta que quer excluir do sistema bancário?')) {
      try {
        await this.db.collection('transactions').doc(id).delete();
        this.toast('Excluído da nuvem permanentemente');
        this.loadTransactions();
      } catch (err) {}
    }
  },

  async togglePaid(id, currentStatus) {
    try {
      await this.db.collection('transactions').doc(id).update({ is_paid: !currentStatus });
      this.loadTransactions();
    } catch (e) {}
  },

  /* --- ADMIN (FIREBASE) --- */
  async loadAdmin() {
    // Seção de Usuários só aparece para o Super Admin
    const usersDiv = document.getElementById('pending-users-list');
    const adminPanelUsers = document.getElementById('admin-panel-users');
    
    if (this.userDoc.role === 'ADMIN') {
      if(adminPanelUsers) adminPanelUsers.classList.remove('hidden');
      try {
        const usersSnap = await this.db.collection('users').where('approved', '==', false).get();
        usersDiv.innerHTML = '';
        
        if (usersSnap.empty) {
          usersDiv.innerHTML = '<div class="text-muted">Nenhum convite pendente.</div>';
        } else {
          usersSnap.forEach(doc => {
            const u = doc.data();
            usersDiv.innerHTML += `
              <div class="user-card">
                <div><strong>${u.name}</strong><br><small class="text-muted">${u.email}</small></div>
                <button class="btn-primary" onclick="app.approveUser('${doc.id}')">Aprovar</button>
              </div>
            `;
          });
        }
      } catch(e) {}
    } else {
      if(adminPanelUsers) adminPanelUsers.classList.add('hidden');
    }

    // Seção de Categorias aparece para TODOS (mas cada um verá apenas as suas devido ao fetchCategories)
    try {
      const catDiv = document.getElementById('admin-categories-list');
      catDiv.innerHTML = '';
      this.categories.forEach(c => {
         const btnDel = `<button class="btn-icon" style="display:inline; float:right" onclick="app.delCat('${c.id}')">Excluir</button>`;
         catDiv.innerHTML += `
           <div class="upcoming-item mt-2">
             <span><span style="color:${c.color}">●</span> <strong>${c.name}</strong> <small>(${c.type})</small></span>
             ${btnDel}
           </div>
         `;
      });
    } catch (e) {}
  },

  async approveUser(id) {
    try {
      await this.db.collection('users').doc(id).update({ approved: true });
      this.toast('Usuário foi Aprovado! Agora ele terá acesso à plataforma.');
      this.loadAdmin();
    } catch (e) {}
  },

  async handleCreateCategory(e) {
    e.preventDefault();
    const name = document.getElementById('cat-name').value;
    const color = document.getElementById('cat-color').value;
    const type = document.getElementById('cat-type').value;

    try {
      await this.db.collection('categories').add({ name, color, type, author_uid: this.user.uid });
      this.toast('Categoria criada e sincronizada');
      await this.fetchCategories(); 
      this.loadAdmin();
      e.target.reset();
      document.getElementById('cat-color').value = '#4F46E5';
    } catch (e) {}
  },
  
  async delCat(id) {
     const cat = this.categories.find(c => c.id === id);
     if (!cat) return;
     
     if(confirm('Tem certeza? Isso fará as transações antigas perderem a cor.')) {
        await this.db.collection('categories').doc(id).delete();
        await this.fetchCategories(); 
        this.loadAdmin();
     }
  },

  /* --- PROFILE --- */
  async handleUpdateProfile(e) {
    e.preventDefault();
    const newName = document.getElementById('profile-name-edit').value.trim();
    if(!newName) return;
    try {
      await this.db.collection('users').doc(this.user.uid).update({ name: newName });
      this.userDoc.name = newName;
      document.getElementById('user-name-display').textContent = newName;
      document.getElementById('user-avatar').textContent = newName.charAt(0).toUpperCase();
      this.toast('Perfil alterado maravilhosamente!');
    } catch(err) {
      this.toast('Não consegui alterar. O banco ainda bloqueou?', 'error');
    }
  },

  /* --- CAIXINHAS / METAS --- */
  async loadGoals() {
    try {
      // Cada um vê apenas suas próprias caixinhas
      const snap = await this.db.collection('goals')
        .where('author_uid', '==', this.user.uid)
        .orderBy('created_at', 'desc')
        .get();
      const list = document.getElementById('goals-list');
      list.innerHTML = '';
      
      if(snap.empty) {
         list.innerHTML = '<div class="empty-state" style="grid-column: 1/-1; text-align: center;">Nenhuma caixinha criada neste modo.</div>';
         return;
      }

      snap.forEach(doc => {
         const d = doc.data();
         const perc = Math.min(100, Math.max(0, (d.current / d.target) * 100)).toFixed(1);
         const isDone = perc >= 100;
         list.innerHTML += `
           <div class="card glass-panel" style="display: flex; flex-direction: column; justify-content: space-between; border-top: 4px solid ${isDone ? 'var(--success)' : 'var(--primary)'}">
             <div style="position: relative;">
               <div style="position: absolute; top: -5px; right: -5px; display: flex; gap: 5px;">
                 <button class="btn-icon" onclick="app.editGoal('${doc.id}')" title="Editar Meta"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                 <button class="btn-icon" onclick="app.deleteGoal('${doc.id}')" title="Excluir Meta"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--danger)" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
               </div>
               <h3 style="margin-bottom: 5px">${d.name}</h3>
               <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
                 <span>Meta: R$ ${d.target.toFixed(2)}</span>
                 <strong style="color: ${isDone ? 'var(--success)' : 'inherit'}">${perc}%</strong>
               </div>
               <div style="background: rgba(255,255,255,0.1); border-radius: 10px; height: 8px; overflow: hidden; margin-bottom: 1rem;">
                  <div style="background: ${isDone ? 'var(--success)' : 'var(--primary)'}; height: 100%; width: ${perc}%"></div>
               </div>
               <h3 class="text-success" style="font-size: 1.5rem">R$ ${d.current.toFixed(2)} acumulado</h3>
             </div>
             <div style="margin-top: 1rem; display: flex; gap: 10px;">
                <button class="btn-primary gradient-btn full-width" onclick="app.openDepositModal('${doc.id}', '${d.name}')">Guardar +</button>
             </div>
           </div>
         `;
      });
    } catch(err) {
      console.log('Goals blocked / Local fall', err);
    }
  },

  async handleCreateGoal(e) {
    e.preventDefault();
    const id = document.getElementById('goal-id').value;
    const name = document.getElementById('goal-name').value;
    const target = parseFloat(document.getElementById('goal-target').value || 0);
    const curr = parseFloat(document.getElementById('goal-current').value || 0);
    
    if (isNaN(target) || target <= 0) {
      this.toast('A meta deve ser um valor válido', 'error');
      return;
    }

    const payload = {
       name: name,
       target: target,
       current: curr,
       scope: this.currentScope
    };

    try {
      if (id) {
        await this.db.collection('goals').doc(id).update(payload);
        this.toast('Caixinha atualizada!');
      } else {
        payload.created_at = firebase.firestore.FieldValue.serverTimestamp();
        payload.author_uid = this.user ? this.user.uid : 'anon';
        await this.db.collection('goals').add(payload);
        this.toast('Sua Caixinha Mágica foi criada!');
      }
    } catch(err) {
      console.error("Save Goal Error:", err);
      this.toast('Falha ao salvar: ' + (err.code || err.message), 'error');
    } finally {
      this.closeModal('goal-modal');
      this.loadGoals();
    }
  },

  async editGoal(id) {
    try {
      const doc = await this.db.collection('goals').doc(id).get();
      if(doc.exists) {
        const d = doc.data();
        document.getElementById('goal-id').value = id;
        document.getElementById('goal-name').value = d.name;
        document.getElementById('goal-target').value = d.target;
        document.getElementById('goal-current').value = d.current;
        document.getElementById('goal-modal-title').textContent = 'Editar Meta';
        this.openModal('goal-modal');
      }
    } catch(err) {
      this.toast('Erro ao buscar dados da caixinha', 'error');
    }
  },

  async deleteGoal(id) {
    if(confirm('Tem certeza que deseja apagar esta caixinha? O dinheiro guardado nela será perdido no sistema!')) {
      try {
        await this.db.collection('goals').doc(id).delete();
        this.toast('Caixinha excluída com sucesso');
        this.loadGoals();
      } catch(err) {
        this.toast('Erro ao excluir caixinha', 'error');
      }
    }
  },

  openDepositModal(id, name) {
    document.getElementById('deposit-goal-id').value = id;
    document.getElementById('deposit-title').textContent = "Depositar: " + name;
    this.openModal('deposit-modal');
  },

  async handleDeposit(e) {
    e.preventDefault();
    const id = document.getElementById('deposit-goal-id').value;
    const amountStr = document.getElementById('deposit-amount').value;
    const amount = parseFloat(amountStr || 0);

    if (isNaN(amount) || amount <= 0) {
      this.toast('Valor de depósito inválido', 'error');
      return;
    }

    try {
      await this.db.collection('goals').doc(id).update({
         current: firebase.firestore.FieldValue.increment(amount)
      });
      this.closeModal('deposit-modal');
      this.toast('Dinheiro Guardado com Sucesso!', 'success');
      this.loadGoals();
      e.target.reset();
    } catch(err) {
      console.error("Deposit Error:", err);
      this.toast('Falha ao Guardar Dinheiro: ' + (err.message || 'Erro'), 'error');
    }
  },

  /* --- FAMILY LINKING SYSTEM --- */
  async handleLinkFamily() {
    const code = prompt("Digite o Código de Vínculo da outra pessoa (o ID dela) para se unirem:");
    if (!code || code.trim() === "") return;

    try {
      this.toast("Tentando vincular...");
      // Buscar se o usuário do código existe
      const targetDoc = await this.db.collection('users').doc(code).get();
      if (!targetDoc.exists) {
        this.toast("Código inválido ou usuário não encontrado.", "error");
        return;
      }

      const targetData = targetDoc.data();
      const newFamilyId = targetData.family_id || code;

      // Vincular o usuário atual ao family_id do alvo
      await this.db.collection('users').doc(this.user.uid).update({
        family_id: newFamilyId
      });

      this.userDoc.family_id = newFamilyId;
      this.toast("Sucesso! Famílias vinculadas. Agora vocês compartilham transações de família.", "success");
      this.loadDashboard();
    } catch (e) {
      this.toast("Erro ao vincular: " + e.message, "error");
    }
  },

  copyFamilyCode() {
    const code = this.user.uid;
    // Tenta usar a API da área de transferência moderna, senão cai pro prompt
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        this.toast("Seu Código de Vínculo foi copiado! Mande para seu familiar.");
      }).catch(() => {
        prompt("Copie seu código abaixo:", code);
      });
    } else {
      prompt("Copie seu código abaixo:", code);
    }
  }

};

document.addEventListener('DOMContentLoaded', () => { app.init(); });
