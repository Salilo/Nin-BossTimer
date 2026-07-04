const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Arquivo para persistência
const DATA_FILE = path.join(__dirname, 'boss_data.json');

// Dados padrão
let data = {
  bosses: {
    'Lich King': { respawn: 5, image: '' },
    'Deathwing': { respawn: 10, image: '' },
    'Ragnaros': { respawn: 15, image: '' }
  },
  kill_counts: {
    'Lich King': 0,
    'Deathwing': 0,
    'Ragnaros': 0
  },
  respawn_times: {},
  kill_history: [],
  timers: {}
};

// Carregar dados salvos
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      data = { ...data, ...saved };
      console.log('📂 Dados carregados com sucesso!');
    }
  } catch (error) {
    console.error('❌ Erro ao carregar dados:', error);
  }
}

// Salvar dados
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('💾 Dados salvos com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao salvar dados:', error);
  }
}

// Inicializar dados
loadData();

// Timers em memória
const activeTimers = {};

// Rotas da API
app.get('/api/status', (req, res) => {
  res.json({
    bosses: data.bosses,
    kill_counts: data.kill_counts,
    respawn_times: data.respawn_times,
    kill_history: data.kill_history.slice(-50),
    timers: activeTimers,
    timestamp: Date.now()
  });
});

app.post('/api/kill', (req, res) => {
  const { boss } = req.body;
  
  if (!boss || !data.bosses[boss]) {
    return res.status(400).json({ error: 'Boss não encontrado' });
  }

  // Atualizar kills
  data.kill_counts[boss] = (data.kill_counts[boss] || 0) + 1;
  
  const respawnMinutes = data.bosses[boss].respawn;
  const killTime = new Date();
  const respawnTime = new Date(killTime.getTime() + respawnMinutes * 60 * 1000);
  
  // Adicionar ao histórico
  data.kill_history.push({
    boss: boss,
    kill_number: data.kill_counts[boss],
    kill_time: killTime.toISOString(),
    respawn_time: respawnTime.toISOString(),
    respawn_minutes: respawnMinutes
  });
  
  // Manter apenas os últimos 100 registros
  if (data.kill_history.length > 100) {
    data.kill_history = data.kill_history.slice(-100);
  }
  
  // Salvar tempo de respawn
  data.respawn_times[boss] = respawnTime.toISOString();
  
  // Iniciar timer
  startTimer(boss, respawnMinutes);
  
  saveData();
  
  res.json({
    success: true,
    boss: boss,
    kill_count: data.kill_counts[boss],
    kill_time: killTime.toISOString(),
    respawn_time: respawnTime.toISOString(),
    respawn_minutes: respawnMinutes
  });
});

app.post('/api/respawn', (req, res) => {
  const { boss } = req.body;
  
  if (!boss || !data.bosses[boss]) {
    return res.status(400).json({ error: 'Boss não encontrado' });
  }
  
  // Remover timer ativo
  delete activeTimers[boss];
  
  // Atualizar tempo de respawn
  const respawnTime = new Date();
  data.respawn_times[boss] = respawnTime.toISOString();
  
  saveData();
  
  res.json({
    success: true,
    boss: boss,
    respawn_time: respawnTime.toISOString()
  });
});

app.post('/api/boss', (req, res) => {
  const { nome, tempo, kills, image } = req.body;
  
  if (!nome || !tempo) {
    return res.status(400).json({ error: 'Nome e tempo são obrigatórios' });
  }
  
  if (data.bosses[nome]) {
    return res.status(400).json({ error: 'Boss já existe' });
  }
  
  data.bosses[nome] = {
    respawn: parseInt(tempo),
    image: image || ''
  };
  data.kill_counts[nome] = parseInt(kills) || 0;
  
  saveData();
  
  res.json({ success: true, boss: nome });
});

app.post('/api/edit-boss', (req, res) => {
  const { nome, respawn, image } = req.body;
  
  if (!nome || !data.bosses[nome]) {
    return res.status(400).json({ error: 'Boss não encontrado' });
  }
  
  if (respawn) {
    data.bosses[nome].respawn = parseInt(respawn);
  }
  if (image !== undefined) {
    data.bosses[nome].image = image;
  }
  
  saveData();
  res.json({ success: true });
});

app.delete('/api/boss', (req, res) => {
  const { nome } = req.body;
  
  if (!nome || !data.bosses[nome]) {
    return res.status(400).json({ error: 'Boss não encontrado' });
  }
  
  delete data.bosses[nome];
  delete data.kill_counts[nome];
  delete data.respawn_times[nome];
  delete activeTimers[nome];
  
  data.kill_history = data.kill_history.filter(h => h.boss !== nome);
  
  saveData();
  res.json({ success: true });
});

app.post('/api/edit-kills', (req, res) => {
  const { boss, kills } = req.body;
  
  if (!boss || !data.bosses[boss]) {
    return res.status(400).json({ error: 'Boss não encontrado' });
  }
  
  data.kill_counts[boss] = parseInt(kills) || 0;
  saveData();
  
  res.json({ success: true });
});

app.post('/api/clear-history', (req, res) => {
  data.kill_history = [];
  saveData();
  res.json({ success: true });
});

// Função para iniciar timer
function startTimer(boss, minutes) {
  if (activeTimers[boss]) {
    clearInterval(activeTimers[boss].interval);
  }
  
  const endTime = new Date(Date.now() + minutes * 60 * 1000);
  
  const updateTimer = () => {
    const now = new Date();
    const remaining = Math.max(0, endTime.getTime() - now.getTime());
    const remainingSeconds = Math.floor(remaining / 1000);
    const minutesLeft = Math.floor(remainingSeconds / 60);
    const secondsLeft = remainingSeconds % 60;
    
    activeTimers[boss] = {
      minutes: minutesLeft,
      seconds: secondsLeft,
      totalSeconds: remainingSeconds,
      endTime: endTime.toISOString(),
      isActive: remainingSeconds > 0
    };
    
    if (remainingSeconds <= 0) {
      clearInterval(activeTimers[boss].interval);
      delete activeTimers[boss];
      
      const now = new Date();
      data.respawn_times[boss] = now.toISOString();
      saveData();
      console.log(`🔄 ${boss} respawnou!`);
    }
  };
  
  updateTimer();
  
  const interval = setInterval(updateTimer, 1000);
  activeTimers[boss] = {
    ...activeTimers[boss],
    interval: interval
  };
}

// Inicializar timers
function initializeTimers() {
  const now = new Date();
  for (const [boss, respawnTime] of Object.entries(data.respawn_times)) {
    const respawnDate = new Date(respawnTime);
    if (respawnDate > now) {
      const remainingMs = respawnDate.getTime() - now.getTime();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      if (remainingMinutes > 0) {
        startTimer(boss, remainingMinutes);
      }
    }
  }
}

initializeTimers();

// Servir arquivos estáticos
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
});
