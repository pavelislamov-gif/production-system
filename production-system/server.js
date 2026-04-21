const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'productions.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'));
}

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

function readData() {
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    // Отправляем обновление всем подключенным клиентам
    io.emit('data-updated', data);
}

function generateId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 8);
}

// API для начальной загрузки данных
app.get('/api/productions', (req, res) => {
    const productions = readData();
    res.json(productions);
});

// Шаблоны участков (предустановленные)
const SITE_TEMPLATES = [
    {
        id: 'template_mechanical',
        name: 'Механическая обработка',
        type: 'механический',
        defaultParts: [
            { name: 'Корпусная деталь', description: 'Изготовление корпусных деталей из металла' },
            { name: 'Вал', description: 'Изготовление валов различного диаметра' }
        ],
        defaultTasks: [
            { title: 'Настройка оборудования', description: 'Проверить и настроить станки', status: 'Ожидает' },
            { title: 'Контроль качества', description: 'Проверить первые образцы', status: 'Ожидает' }
        ]
    },
    {
        id: 'template_welding',
        name: 'Сварочный участок',
        type: 'сварочный',
        defaultParts: [
            { name: 'Сварная рама', description: 'Сварка металлической рамы по чертежу' },
            { name: 'Кронштейн', description: 'Изготовление кронштейнов сваркой' }
        ],
        defaultTasks: [
            { title: 'Подготовка металла', description: 'Очистка и разделка кромок', status: 'Ожидает' },
            { title: 'Сварка', description: 'Выполнить сварочные работы', status: 'Ожидает' },
            { title: 'Зачистка швов', description: 'Зачистить сварочные швы', status: 'Ожидает' }
        ]
    },
    {
        id: 'template_assembly',
        name: 'Сборочный цех',
        type: 'сборочный',
        defaultParts: [
            { name: 'Узел крепления', description: 'Сборка крепежного узла' },
            { name: 'Механизм передачи', description: 'Сборка редуктора' }
        ],
        defaultTasks: [
            { title: 'Комплектация', description: 'Проверить наличие всех деталей', status: 'Ожидает' },
            { title: 'Сборка', description: 'Произвести сборку узлов', status: 'Ожидает' },
            { title: 'Испытания', description: 'Провести тестирование', status: 'Ожидает' }
        ]
    },
    {
        id: 'template_painting',
        name: 'Окрасочный участок',
        type: 'окрасочный',
        defaultParts: [
            { name: 'Заготовка под покраску', description: 'Подготовленная деталь' }
        ],
        defaultTasks: [
            { title: 'Очистка поверхности', description: 'Удалить загрязнения', status: 'Ожидает' },
            { title: 'Грунтовка', description: 'Нанести грунтовочный слой', status: 'Ожидает' },
            { title: 'Окраска', description: 'Нанести основное покрытие', status: 'Ожидает' },
            { title: 'Сушка', description: 'Высушить изделие', status: 'Ожидает' }
        ]
    },
    {
        id: 'template_empty',
        name: 'Пустой шаблон',
        type: 'пользовательский',
        defaultParts: [],
        defaultTasks: []
    }
];

app.get('/api/templates', (req, res) => {
    res.json(SITE_TEMPLATES);
});

app.post('/api/productions', (req, res) => {
    const productions = readData();
    const newProduction = {
        id: generateId(),
        name: req.body.name,
        activity: req.body.activity || 'Не указано',
        sites: []
    };
    productions.push(newProduction);
    writeData(productions);
    res.json(newProduction);
});

app.put('/api/productions/:id', (req, res) => {
    const productions = readData();
    const index = productions.findIndex(p => p.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Не найдено' });
    productions[index] = { ...productions[index], ...req.body };
    writeData(productions);
    res.json(productions[index]);
});

app.delete('/api/productions/:id', (req, res) => {
    let productions = readData();
    productions = productions.filter(p => p.id !== req.params.id);
    writeData(productions);
    res.json({ success: true });
});

// Создание участка из шаблона
app.post('/api/productions/:prodId/sites/from-template', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    const { templateId, customName, customParts, customTasks } = req.body;
    const template = SITE_TEMPLATES.find(t => t.id === templateId);
    
    if (!template) {
        return res.status(404).json({ error: 'Шаблон не найден' });
    }
    
    // Формируем детали (если переданы кастомные - используем их, иначе из шаблона)
    let parts = [];
    if (customParts && customParts.length > 0) {
        parts = customParts.map(p => ({
            id: generateId(),
            name: p.name,
            description: p.description || ''
        }));
    } else {
        parts = template.defaultParts.map(p => ({
            id: generateId(),
            name: p.name,
            description: p.description
        }));
    }
    
    let tasks = [];
    if (customTasks && customTasks.length > 0) {
        tasks = customTasks.map(t => ({
            id: generateId(),
            title: t.title,
            description: t.description || '',
            status: t.status || 'Ожидает'
        }));
    } else {
        tasks = template.defaultTasks.map(t => ({
            id: generateId(),
            title: t.title,
            description: t.description,
            status: t.status
        }));
    }
    
    const newSite = {
        id: generateId(),
        name: customName || template.name,
        type: template.type,
        parts: parts,
        tasks: tasks
    };
    
    production.sites.push(newSite);
    writeData(productions);
    res.json(newSite);
});

// Обновление участка
app.put('/api/productions/:prodId/sites/:siteId', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    const site = production.sites.find(s => s.id === req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Участок не найден' });
    
    Object.assign(site, req.body);
    writeData(productions);
    res.json(site);
});

app.delete('/api/productions/:prodId/sites/:siteId', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    production.sites = production.sites.filter(s => s.id !== req.params.siteId);
    writeData(productions);
    res.json({ success: true });
});

// Обновление детали
app.put('/api/productions/:prodId/sites/:siteId/parts/:partId', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    const site = production.sites.find(s => s.id === req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Участок не найден' });
    
    const part = site.parts.find(p => p.id === req.params.partId);
    if (!part) return res.status(404).json({ error: 'Деталь не найдена' });
    
    Object.assign(part, req.body);
    writeData(productions);
    res.json(part);
});

app.delete('/api/productions/:prodId/sites/:siteId/parts/:partId', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    const site = production.sites.find(s => s.id === req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Участок не найден' });
    
    site.parts = site.parts.filter(p => p.id !== req.params.partId);
    writeData(productions);
    res.json({ success: true });
});

// Обновление задачи
app.put('/api/productions/:prodId/sites/:siteId/tasks/:taskId', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    const site = production.sites.find(s => s.id === req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Участок не найден' });
    
    const task = site.tasks.find(t => t.id === req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    
    Object.assign(task, req.body);
    writeData(productions);
    res.json(task);
});

app.delete('/api/productions/:prodId/sites/:siteId/tasks/:taskId', (req, res) => {
    const productions = readData();
    const production = productions.find(p => p.id === req.params.prodId);
    if (!production) return res.status(404).json({ error: 'Производство не найдено' });
    
    const site = production.sites.find(s => s.id === req.params.siteId);
    if (!site) return res.status(404).json({ error: 'Участок не найден' });
    
    site.tasks = site.tasks.filter(t => t.id !== req.params.taskId);
    writeData(productions);
    res.json({ success: true });
});

// WebSocket соединение
io.on('connection', (socket) => {
    console.log('Новый пользователь подключен');
    
    socket.on('disconnect', () => {
        console.log('Пользователь отключен');
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на http://0.0.0.0:${PORT}`);
    console.log('Режим реального времени активен');
});