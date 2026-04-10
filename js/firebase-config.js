// Configuração Oficial do Firebase para o LisFinance
const firebaseConfig = {
  apiKey: "AIzaSyBXSZxEWHJQmvHmd2Zs2QIsGvvJPC9Emf4",
  authDomain: "lisfinanc.firebaseapp.com",
  databaseURL: "https://lisfinanc-default-rtdb.firebaseio.com",
  projectId: "lisfinanc",
  storageBucket: "lisfinanc.firebasestorage.app",
  messagingSenderId: "6735654498",
  appId: "1:6735654498:web:0c62940529fd520b396b3b",
  measurementId: "G-8PK1JTKPK1"
};

// Inicializador compatível com o Firebase v8 usado em nosso App
firebase.initializeApp(firebaseConfig);
