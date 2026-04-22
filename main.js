// main.js - Processo principal do Electron
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;

// Variáveis globais
let mainWindow;
let expressServer;

// Garantir instância única (evita múltiplas janelas durante hot-reload)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// Função para criar a janela
function createWindow() {
  // Escolher ícone preferindo .ico no Windows e .png nos demais, com fallback
  const imgDir = path.join(__dirname, 'img');
  const candidates = process.platform === 'win32'
    ? ['mariposa.ico', 'icon.ico', 'mariposa.png', 'icon.png']
    : ['mariposa.png', 'icon.png'];
  const resolvedIconPath = candidates
    .map(name => path.join(imgDir, name))
    .find(p => {
      try { return fs.existsSync(p); } catch { return false; }
    });
  if (resolvedIconPath) {
    console.log('Ícone da janela:', resolvedIconPath);
  } else {
    console.log('Nenhum ícone encontrado em', imgDir);
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false
    },
    icon: resolvedIconPath,
    autoHideMenuBar: true
  });

  const url = 'http://localhost:3001/index.html';
  mainWindow.loadURL(url);

  const disableDevTools = process.env.DISABLE_DEVTOOLS === '1';
  if (isDev && !disableDevTools) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Iniciar servidor Express
function startExpressServer() {
  const express = require('express');
  const fs = require('fs-extra');
  const cors = require('cors');

  const expressApp = express();
  const PORT = 3001;
  const userData = app.getPath('userData');
  const dataDir = path.join(userData, 'GastosRafinha');
  const DATA_FILE = path.join(dataDir, 'data.json');

  // Criar diretório de dados se não existir
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Middleware
  expressApp.use(cors());
  expressApp.use(express.json());
  expressApp.use(express.static(__dirname));

  // Garantir que o arquivo data.json existe
  async function ensureDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
      await fs.writeJSON(DATA_FILE, { expenses: [] }, { spaces: 2 });
    }
  }

  // Ler todos os gastos
  expressApp.get('/api/expenses', async (req, res) => {
    try {
      await ensureDataFile();
      const data = await fs.readJSON(DATA_FILE);
      res.json(data.expenses || []);
    } catch (error) {
      console.error('Erro ao ler gastos:', error);
      res.status(500).json({ error: 'Falha ao ler gastos' });
    }
  });

  // Adicionar novo gasto
  expressApp.post('/api/expenses', async (req, res) => {
    try {
      await ensureDataFile();
      const data = await fs.readJSON(DATA_FILE);
      const newExpense = req.body;

      if (!newExpense.id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
      }

      data.expenses.push(newExpense);
      await fs.writeJSON(DATA_FILE, data, { spaces: 2 });
      res.status(201).json(newExpense);
    } catch (error) {
      console.error('Erro ao adicionar gasto:', error);
      res.status(500).json({ error: 'Falha ao adicionar gasto' });
    }
  });

  // Atualizar gasto existente
  expressApp.put('/api/expenses/:id', async (req, res) => {
    try {
      await ensureDataFile();
      const data = await fs.readJSON(DATA_FILE);
      const { id } = req.params;
      const updatedExpense = req.body;

      const index = data.expenses.findIndex(e => e.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Gasto não encontrado' });
      }

      data.expenses[index] = updatedExpense;
      await fs.writeJSON(DATA_FILE, data, { spaces: 2 });
      res.json(updatedExpense);
    } catch (error) {
      console.error('Erro ao atualizar gasto:', error);
      res.status(500).json({ error: 'Falha ao atualizar gasto' });
    }
  });

  // Deletar gasto
  expressApp.delete('/api/expenses/:id', async (req, res) => {
    try {
      await ensureDataFile();
      const data = await fs.readJSON(DATA_FILE);
      const { id } = req.params;

      const index = data.expenses.findIndex(e => e.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Gasto não encontrado' });
      }

      data.expenses.splice(index, 1);
      await fs.writeJSON(DATA_FILE, data, { spaces: 2 });
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao deletar gasto:', error);
      res.status(500).json({ error: 'Falha ao deletar gasto' });
    }
  });

  // Rota de limpar mês removida

  // Iniciar servidor e resolver somente após "listening"
  return new Promise((resolve) => {
    expressServer = expressApp.listen(PORT, () => {
      console.log(`🚀 Servidor Express rodando em http://localhost:${PORT}`);
      resolve(expressServer);
    });
  });
}

// Quando o app está pronto
app.on('ready', () => {
  startExpressServer().then(() => {
    createWindow();
    createMenu();
  });
});

// Quando todas as janelas são fechadas
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Tentar fechar o servidor ao sair para liberar a porta rapidamente
function gracefulShutdown() {
  if (expressServer) {
    try { expressServer.close(); } catch {}
  }
}
app.on('before-quit', gracefulShutdown);
process.on('SIGINT', () => { gracefulShutdown(); app.quit(); });
process.on('SIGTERM', () => { gracefulShutdown(); app.quit(); });

// Quando o app é reaberto (macOS)
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC quit removido (botão Sair não existe mais)

// Menu
function createMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Sair',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen', accelerator: 'F11' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC: toggle fullscreen
ipcMain.on('toggle-fullscreen', () => {
  if (!mainWindow) return;
  const want = !mainWindow.isFullScreen();
  mainWindow.setFullScreen(want);
});
