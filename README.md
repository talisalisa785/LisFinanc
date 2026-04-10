# 💰 LisFinance | Gestão Financeira Inteligente

**LisFinance** é uma aplicação web moderna e minimalista desenvolvida para ajudar no controle financeiro pessoal e familiar. Com uma interface elegante e recursos de sincronização em tempo real via **Firebase**, ela torna o acompanhamento de gastos e metas uma experiência fluida e segura.

## ✨ Funcionalidades Principais

- 📊 **Dashboard Consolidado**: Visualize seu saldo, entradas e saídas pagas em um relance.
- 👨‍👩‍👧‍👦 **Modo Familiar / Pessoal**: Alterne entre suas finanças privadas e as contas compartilhadas da casa.
- 🎯 **Caixinhas de Metas**: Crie objetivos de economia (como "Reserva de Emergência" ou "Viagem") e acompanhe o progresso.
- 📅 **Controle Mensal**: Navegue entre os meses para revisar seu histórico financeiro.
- 🌙 **Tema Dark Premium**: Interface otimizada para conforto visual com estética moderna.
- ⚡ **PWA Ready**: Funciona como um aplicativo direto no seu celular ou desktop.

## 🚀 Tecnologias Utilizadas

- **Frontend**: HTML5, CSS3 (Vanilla com Variáveis Modernas), JavaScript (ES6+).
- **Backend/Database**: Firebase v8 (Firestore & Authentication).
- **Gráficos**: Chart.js.
- **Design**: Glassmorphism e Design Responsivo.

## 🛠️ Como Usar (GitHub Pages)

Este projeto está pronto para ser hospedado no **GitHub Pages**.

1. Crie um repositório no seu GitHub.
2. Arraste todos os arquivos da pasta do projeto para o repositório.
3. Vá em **Settings** > **Pages**.
4. Em "Build and deployment", selecione a branch `main` e a pasta `/ (root)`.
5. Clique em **Save**. Em alguns minutos, seu site estará online!

## ⚠️ Segurança

As chaves do Firebase incluídas no arquivo `js/firebase-config.js` são necessárias para o funcionamento da aplicação cliente. Recomenda-se:
- Configurar **HTTP Referrer Restrictions** no Console do Google Cloud para que as chaves só funcionem no domínio do seu site.
- Manter as **Security Rules** do Firebase Firestore sempre atualizadas para garantir que um usuário só acesse seus próprios dados.

---
Desenvolvido com ❤️ para organização financeira.
