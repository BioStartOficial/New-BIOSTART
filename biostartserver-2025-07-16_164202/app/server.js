import express from 'express';
import axios from 'axios';
import cors from 'cors';

const app = express();

// Middleware para habilitar CORS para todas as requisições
app.use(cors());
app.use(express.json());

// --- SUAS CREDENCIAIS AIRTABLE E GEMINI (DO FICHEIRO .env NO GLITCH) ---
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Log para verificar se as chaves foram carregadas
console.log("Backend Init: AIRTABLE_BASE_ID carregado:", AIRTABLE_BASE_ID ? "Sim" : "Não");
console.log("Backend Init: AIRTABLE_API_KEY carregado:", AIRTABLE_API_KEY ? "Sim" : "Não");
console.log("Backend Init: GEMINI_API_KEY carregado:", GEMINI_API_KEY ? "Sim" : "Não");

// --- Rota de Teste (GET /) ---
app.get('/', (req, res) => {
  console.log("Backend: Recebida requisição GET para / (rota de teste)");
  res.status(200).json({ status: 'Server is running', message: 'Hello from BioStart Backend!' });
});

// --- ROTAS DE AUTENTICAÇÃO (Utilizador e Admin) ---
app.post("/registro", async (req, res) => {
  const { name, email, password, age, regionCity, profession, renewableEnergyExperience, acceptTerms } = req.body;
  if (!name || !email || !password || !age || !regionCity) {
    return res.status(400).send({ error: "Por favor, preencha todos os campos obrigatórios." });
  }
  try {
    const existingUsers = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores?filterByFormula={Email}='${email}'&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
    );
    if (existingUsers.data.records.length > 0) {
      return res.status(409).send({ error: "Este email já está registado." });
    }
    const response = await axios.post(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores`,
      { fields: { "Nome Completo": name, Email: email, "Senha (Hash)": password, Idade: parseInt(age), "Região/Cidade": regionCity, "Profissão/Ocupação": profession, "Experiência Energia Renovável": renewableEnergyExperience, "Aceita Termos": acceptTerms, CompletedContentIDs: "[]" } },
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
    );
    res.status(200).send({ success: true, recordId: response.data.id });
  } catch (err) {
    console.error("Backend: Erro no registo de utilizador:", err.response?.data || err.message);
    res.status(500).send({ error: "Erro ao registar utilizador", details: err.response?.data || err.message });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).send({ error: "Por favor, insira o email e a senha." });
  }
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores?filterByFormula=AND({Email}='${email}',{Senha (Hash)}='${password}')&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
    );
    if (response.data.records.length > 0) {
      const userRecord = response.data.records[0];
      const completedIds = JSON.parse(userRecord.fields.CompletedContentIDs || '[]');
      res.status(200).send({ success: true, user: userRecord.fields, recordId: userRecord.id, completedContentIds: completedIds });
    } else {
      res.status(401).send({ error: "Email ou senha incorretos." });
    }
  } catch (err) {
    console.error("Backend: Erro no login de utilizador:", err.response?.data || err.message);
    res.status(500).send({ error: "Erro ao fazer login", details: err.response?.data || err.message });
  }
});

app.post("/admin-registro", async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).send({ error: "Nome, email e senha são obrigatórios." });
    }
    try {
        const existingAdmins = await axios.get(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores?filterByFormula={Email}='${email}'&maxRecords=1`,
            { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
        );
        if (existingAdmins.data.records.length > 0) {
            return res.status(409).send({ error: "Este email de administrador já está registado." });
        }
        const response = await axios.post(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores`,
            { fields: { "Nome do Admin": name, "Email": email, "Senha (Hash)": password } },
            { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
        );
        res.status(200).send({ success: true, recordId: response.data.id });
    } catch (err) {
        console.error("Backend: Erro no registo de administrador:", err.response?.data || err.message);
        res.status(500).send({ error: "Erro ao registar administrador", details: err.response?.data || err.message });
    }
});

app.post("/admin-login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).send({ error: "Email e senha são obrigatórios." });
    try {
        const response = await axios.get(
        `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Administradores?filterByFormula=AND({Email}='${email}',{Senha (Hash)}='${password}')&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
        );
        if (response.data.records.length > 0) {
        const adminRecord = response.data.records[0];
        res.status(200).send({ success: true, isAdmin: true, admin: adminRecord.fields, recordId: adminRecord.id });
        } else {
        res.status(401).send({ error: "Credenciais de administrador incorretas." });
        }
    } catch (err) {
        res.status(500).send({ error: "Erro no login de administrador.", details: err.response?.data || err.message });
    }
});

// --- ROTAS DE CONTEÚDO ---
const getContent = async (res, tableName, fieldMapping) => {
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );
    const data = response.data.records.map(record => fieldMapping(record));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: `Erro ao obter dados de ${tableName}.` });
  }
};

app.get("/content/educational-texts", (req, res) => getContent(res, 'Conteudo Educativo', record => ({
  id: record.id,
  title: record.fields.titulo,  
  content: record.fields.conteudo,  
  text: record.fields.conteudo,
  annexUrl: record.fields.imageUrl || null,
  image: record.fields.imageUrl || null,
})));

app.get("/content/quizzes", (req, res) => getContent(res, 'Quizzes', record => {
    let questions = [];
    try {
        if (record.fields.Perguntas) {
            const parsedQuestions = JSON.parse(record.fields.Perguntas);
            if (Array.isArray(parsedQuestions)) {
                questions = parsedQuestions.filter(q => q && typeof q.question === 'string' && q.question.trim() !== '' && Array.isArray(q.options) && q.options.length > 0 && q.options.every(opt => typeof opt === 'string' && opt.trim() !== ''));
            }
        }
    } catch (e) { console.error("Erro JSON no quiz:", record.id); }
    // CORREÇÃO: Usar o nome de campo "Title"
    return { id: record.id, title: record.fields.Title, questions };
}));

app.get("/content/checklists", (req, res) => getContent(res, 'Checklists', record => {
    let items = [];
    try {
        if (record.fields.items) {
            items = JSON.parse(record.fields.items);
        }
    } catch (e) { console.error("Erro JSON no checklist:", record.id); }
    return { id: record.id, title: record.fields.titulo, items };
}));

const postToAirtable = async (res, tableName, fieldsToPost) => {
  try {
    const response = await axios.post(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}`,
      { fields: fieldsToPost },
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
    );
    res.status(200).send({ success: true, recordId: response.data.id });
  } catch (error) {
    console.error(`Erro ao criar em ${tableName}:`, error.response?.data || error.message);
    res.status(500).send({ error: `Erro ao criar em ${tableName}.`, details: error.response?.data || error.message });
  }
};

app.post("/content/educational-texts", (req, res) => {
  const { title, content, annexUrl } = req.body;
  if (!title || !content) {
    return res.status(400).send({ error: "Campos obrigatórios em falta." });
  }
  const fields = { titulo: title, conteudo: content };
  if (annexUrl) fields.imageUrl = annexUrl;
  postToAirtable(res, 'Conteudo Educativo', fields);
});

app.post("/content/quizzes", (req, res) => {
  const { title, questions } = req.body;
  if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).send({ error: "Título e pelo menos uma pergunta são obrigatórios." });
  }
  // CORREÇÃO: Usar os nomes de campo corretos "Title" e "Perguntas"
  const fields = { 'Title': title, 'Perguntas': JSON.stringify(questions) };
  postToAirtable(res, 'Quizzes', fields);
});

app.post("/content/checklists", (req, res) => {
  const { title, items } = req.body;
  if (!title || !items || !Array.isArray(items)) {
      return res.status(400).send({ error: "Título e itens são obrigatórios." });
  }
  const fields = { 'titulo': title, 'items': JSON.stringify(items) };
  postToAirtable(res, 'Checklists', fields);
});

const patchContent = async (res, tableName, id, fieldsToUpdate) => {
  if (Object.keys(fieldsToUpdate).length === 0) {
    return res.status(400).send({ error: "Nenhum campo para atualizar." });
  }
  try {
    const response = await axios.patch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}/${id}`,
      { fields: fieldsToUpdate },
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
    );
    res.status(200).send({ success: true, data: response.data.fields });
  } catch (error) {
    res.status(500).send({ error: `Erro ao atualizar em ${tableName}.`, details: error.response?.data || error.message });
  }
};

app.patch("/content/educational-texts/:id", (req, res) => {
  const { title, content, annexUrl } = req.body;
  const fields = {};
  if (title) fields.titulo = title;
  if (content) fields.conteudo = content;
  if (annexUrl !== undefined) fields.imageUrl = annexUrl;
  patchContent(res, 'Conteudo Educativo', req.params.id, fields);
});

app.patch("/content/quizzes/:id", (req, res) => {
  const { title, questions } = req.body;
  const fields = {};
  // CORREÇÃO: Usar o nome de campo "Title"
  if (title) fields.Title = title;
  if (questions && Array.isArray(questions)) {
    fields.Perguntas = JSON.stringify(questions);
  }
  patchContent(res, 'Quizzes', req.params.id, fields);
});

app.patch("/content/checklists/:id", (req, res) => {
  const { title, items } = req.body;
  const fields = {};
  if (title) fields.titulo = title;
  if (items && Array.isArray(items)) {
    fields.items = JSON.stringify(items);
  }
  patchContent(res, 'Checklists', req.params.id, fields);
});

const deleteRecord = async (tableName, id, res) => {
  try {
    await axios.delete(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}/${id}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
    );
    res.status(200).send({ success: true });
  } catch (error) {
    res.status(500).send({ error: "Erro ao excluir." });
  }
};

app.delete("/content/quizzes/:id", (req, res) => deleteRecord('Quizzes', req.params.id, res));
app.delete("/content/educational-texts/:id", (req, res) => deleteRecord('Conteudo Educativo', req.params.id, res));
app.delete("/content/checklists/:id", (req, res) => deleteRecord('Checklists', req.params.id, res));

// --- NOVAS ROTAS PARA O CHECKLIST DO UTILIZADOR ---
app.get("/user/:userId/checklist", async (req, res) => {
    const { userId } = req.params;
    try {
        const response = await axios.get(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores/${userId}`,
            { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
        );
        const checklistState = response.data.fields.checklistStateJSON || '{}';
        res.status(200).json({ success: true, checklistState: JSON.parse(checklistState) });
    } catch (error) {
        console.error("Erro ao obter estado do checklist:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Erro ao obter dados do checklist." });
    }
});

app.post("/user/:userId/checklist", async (req, res) => {
    const { userId } = req.params;
    const { checklistState, progress } = req.body;
    try {
        await axios.patch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Utilizadores/${userId}`,
            { fields: { "checklistStateJSON": JSON.stringify(checklistState), "checklistProgress": progress } },
            { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}`, "Content-Type": "application/json" } }
        );
        res.status(200).json({ success: true, message: "Progresso do checklist guardado." });
    } catch (error) {
        console.error("Erro ao guardar estado do checklist:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Erro ao guardar progresso do checklist." });
    }
});


// --- ROTAS DE IA ---
const callGeminiAPI = async (prompt) => {
    if (!GEMINI_API_KEY) {
        throw new Error("A chave da API do Gemini não está configurada no servidor.");
    }
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await axios.post(API_URL, payload, { headers: { 'Content-Type': 'application/json' } });
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return response.data.candidates[0].content.parts[0].text;
    } else {
        throw new Error("Resposta inválida da API do Gemini.");
    }
};
app.post("/generate-content-ai", async (req, res) => {
    const { topic } = req.body;
    if (!topic) return res.status(400).json({ success: false, error: "O tópico é obrigatório." });
    try {
        const prompt = `Aja como um especialista em biogás e energias renováveis. Crie um texto educativo detalhado, claro e bem estruturado sobre o seguinte tópico: "${topic}". O texto deve ser adequado para um público leigo mas interessado, como pequenos agricultores ou estudantes. Organize o conteúdo com títulos e parágrafos curtos.`;
        const generatedText = await callGeminiAPI(prompt);
        res.status(200).json({ success: true, generatedText });
    } catch (error) {
        console.error("Erro ao gerar conteúdo com IA:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Falha ao comunicar com a API de IA." });
    }
});

app.post("/generate-quiz-questions-ai", async (req, res) => {
    const { topic } = req.body;
    if (!topic) {
        return res.status(400).json({ success: false, error: "O tópico é obrigatório." });
    }

    try {
        const prompt = `Crie 5 perguntas de múltipla escolha sobre o tópico de biogás: "${topic}". Formate a resposta EXATAMENTE como um array de objetos JSON, sem nenhum texto ou formatação adicional antes ou depois. Cada objeto deve ter as chaves "question" (string), "options" (um array de 4 strings) e "correct" (o índice da resposta correta, de 0 a 3). Exemplo: [{"question": "...", "options": ["a", "b", "c", "d"], "correct": 0}]`;
        const generatedQuestions = await callGeminiAPI(prompt);
        res.status(200).json({ success: true, generatedQuestions });
    } catch (error) {
        console.error("Erro ao gerar perguntas de quiz com IA:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: "Falha ao comunicar com a API de IA." });
    }
});

// A porta é definida pelo Glitch, mas 3001 é um fallback
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
