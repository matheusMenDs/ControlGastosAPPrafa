// server.js - Backend para gerenciar dados em arquivo JSON
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3001;
const DATA_FILE = path.join(__dirname, "data.json");

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve arquivos estáticos

// Garantir que o arquivo data.json existe
async function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    await fs.writeJSON(DATA_FILE, { expenses: [] }, { spaces: 2 });
  }
}

// Ler todos os gastos
app.get("/api/expenses", async (req, res) => {
  try {
    await ensureDataFile();
    const data = await fs.readJSON(DATA_FILE);
    res.json(data.expenses || []);
  } catch (error) {
    console.error("Erro ao ler gastos:", error);
    res.status(500).json({ error: "Falha ao ler gastos" });
  }
});

// Adicionar novo gasto
app.post("/api/expenses", async (req, res) => {
  try {
    await ensureDataFile();
    const data = await fs.readJSON(DATA_FILE);
    const newExpense = req.body;
    
    if (!newExpense.id) {
      return res.status(400).json({ error: "ID é obrigatório" });
    }
    
    data.expenses.push(newExpense);
    await fs.writeJSON(DATA_FILE, data, { spaces: 2 });
    res.status(201).json(newExpense);
  } catch (error) {
    console.error("Erro ao adicionar gasto:", error);
    res.status(500).json({ error: "Falha ao adicionar gasto" });
  }
});

// Atualizar gasto existente
app.put("/api/expenses/:id", async (req, res) => {
  try {
    await ensureDataFile();
    const data = await fs.readJSON(DATA_FILE);
    const { id } = req.params;
    const updatedExpense = req.body;
    
    const index = data.expenses.findIndex(e => e.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Gasto não encontrado" });
    }
    
    data.expenses[index] = updatedExpense;
    await fs.writeJSON(DATA_FILE, data, { spaces: 2 });
    res.json(updatedExpense);
  } catch (error) {
    console.error("Erro ao atualizar gasto:", error);
    res.status(500).json({ error: "Falha ao atualizar gasto" });
  }
});

// Deletar gasto
app.delete("/api/expenses/:id", async (req, res) => {
  try {
    await ensureDataFile();
    const data = await fs.readJSON(DATA_FILE);
    const { id } = req.params;
    
    const index = data.expenses.findIndex(e => e.id === id);
    if (index === -1) {
      return res.status(404).json({ error: "Gasto não encontrado" });
    }
    
    data.expenses.splice(index, 1);
    await fs.writeJSON(DATA_FILE, data, { spaces: 2 });
    res.json({ success: true });
  } catch (error) {
    console.error("Erro ao deletar gasto:", error);
    res.status(500).json({ error: "Falha ao deletar gasto" });
  }
});

// Rota de limpar mês removida

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
