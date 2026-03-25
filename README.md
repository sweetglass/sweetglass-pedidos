# 🍰 Sweetglass · Pedidos

App de gestão de pedidos de tortas com calendário e controle financeiro.

---

## Como colocar no ar (passo a passo)

### Parte 1 — GitHub (guarda o código)

1. Acesse **github.com** e crie uma conta gratuita
2. Clique em **"New repository"**
3. Nome: `sweetglass-pedidos`  
4. Deixe como **Public** (ou Private) → clique **Create repository**
5. Clique em **"uploading an existing file"**
6. Faça upload de todos os arquivos desta pasta (mantenha a estrutura de pastas)
7. Clique **Commit changes**

---

### Parte 2 — Firebase (banco de dados)

1. Acesse **console.firebase.google.com** e entre com sua conta Google
2. Clique **"Adicionar projeto"**
3. Nome: `sweetglass-pedidos` → clique em Continuar até criar
4. No menu lateral, clique em **Firestore Database**
5. Clique **"Criar banco de dados"**
6. Escolha **"Iniciar no modo de teste"** → Avançar → Ativar
7. No menu lateral, clique em ⚙️ **Configurações do projeto**
8. Role até **"Seus aplicativos"** → clique no ícone **</>** (Web)
9. Registre o app com o nome `sweetglass`
10. Copie o objeto `firebaseConfig` que aparecer — vai ser parecido com isso:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "sweetglass-pedidos.firebaseapp.com",
  projectId: "sweetglass-pedidos",
  storageBucket: "sweetglass-pedidos.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

Guarde esses valores — vai precisar deles na Parte 3.

---

### Parte 3 — Vercel (hospedagem do site)

1. Acesse **vercel.com** e crie uma conta (pode entrar com o GitHub)
2. Clique **"Add New Project"**
3. Conecte ao repositório `sweetglass-pedidos` que criou no GitHub
4. Antes de fazer deploy, clique em **"Environment Variables"**
5. Adicione as 6 variáveis abaixo, copiando os valores do Firebase:

| Nome da variável                  | Valor (do Firebase)       |
|-----------------------------------|---------------------------|
| VITE_FIREBASE_API_KEY             | valor do apiKey           |
| VITE_FIREBASE_AUTH_DOMAIN         | valor do authDomain       |
| VITE_FIREBASE_PROJECT_ID          | valor do projectId        |
| VITE_FIREBASE_STORAGE_BUCKET      | valor do storageBucket    |
| VITE_FIREBASE_MESSAGING_SENDER_ID | valor do messagingSenderId|
| VITE_FIREBASE_APP_ID              | valor do appId            |

6. Clique **Deploy** — aguarde ~2 minutos
7. Sua URL vai aparecer no formato: `sweetglass-pedidos.vercel.app`

---

### Resultado

✅ O site funciona em qualquer celular ou computador  
✅ Vendedora e Aninha veem os mesmos dados em tempo real  
✅ Dados salvos na nuvem — não perdem se fechar o navegador  
✅ Gratuito para o volume de uma confeitaria  

---

## Dúvidas?

Se der algum erro em qualquer etapa, tire um print e mande pro suporte.
