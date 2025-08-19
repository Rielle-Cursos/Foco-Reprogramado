// Data model
const state = {
    dayXP: 0,
    totalXP: 0,
    tasks: {
        morning: [],
        afternoon: [],
        night: []
    },
    notes: [],
    rules: Array(10).fill(false),
    activeTab: 'daily'
};

// DOM Elements
const dayXPElement = document.getElementById('day-xp');
const totalXPElement = document.getElementById('total-xp');
const tasksContainers = {
    morning: document.getElementById('morning-tasks'),
    afternoon: document.getElementById('afternoon-tasks'),
    night: document.getElementById('night-tasks')
};
const notesContainer = document.getElementById('notes-container');
const rulesList = document.getElementById('rules-list');
const updateBtn = document.getElementById('update-btn');
const updateNotification = document.getElementById('update-notification');

// Service Worker and Update Management
let newWorker;
let refreshing = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    renderTasks();
    renderNotes();
    renderRules();
    updateXPCounters();
    setupEventListeners();
    activateTab(state.activeTab);
    registerServiceWorker();
});

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
            console.log('SW registered: ', registration);
            
            // Listen for waiting service worker
            registration.addEventListener('updatefound', () => {
                newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotification();
                    }
                });
            });
        })
        .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
        });

        // Listen for service worker messages
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'CACHE_UPDATED') {
                showUpdateNotification();
            }
        });

        // Handle page refresh after service worker activation
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });
    }
}

// Show update notification
function showUpdateNotification() {
    updateBtn.style.display = 'flex';
    updateNotification.style.display = 'block';
}

// Handle manual update
function handleManualUpdate() {
    if (newWorker) {
        newWorker.postMessage({ action: 'skipWaiting' });
    } else {
        // Force refresh cache
        caches.keys().then(names => {
            names.forEach(name => {
                caches.delete(name);
            });
        }).then(() => {
            window.location.reload();
        });
    }
}

// Load state from localStorage
function loadState() {
    const savedState = localStorage.getItem('productivityState');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            state.dayXP = parsed.dayXP || 0;
            state.totalXP = parsed.totalXP || 0;
            state.tasks = parsed.tasks || {
                morning: [],
                afternoon: [],
                night: []
            };
            state.notes = parsed.notes || [];
            state.rules = parsed.rules || Array(10).fill(false);
            state.activeTab = parsed.activeTab || 'daily';
        } catch (e) {
            console.error("Failed to parse state from localStorage", e);
            localStorage.removeItem('productivityState');
        }
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('productivityState', JSON.stringify(state));
}

// Update XP counters display
function updateXPCounters() {
    dayXPElement.textContent = state.dayXP;
    totalXPElement.textContent = state.totalXP;
}

// Render tasks in all time blocks
function renderTasks() {
    for (const timeBlock in tasksContainers) {
        tasksContainers[timeBlock].innerHTML = '';
        state.tasks[timeBlock].forEach((task, index) => {
            const taskElement = createTaskElement(task, timeBlock, index);
            tasksContainers[timeBlock].appendChild(taskElement);
        });
    }
}

// Create task element
function createTaskElement(task, timeBlock, index) {
    const taskElement = document.createElement('div');
    taskElement.className = `task ${task.completed ? 'completed' : ''}`;
    
    const difficultyClass = task.difficulty === 1 ? 'easy' : 
                          task.difficulty === 2 ? 'medium' : 'hard';
    
    taskElement.innerHTML = `
        <div class="difficulty ${difficultyClass}">${task.difficulty}</div>
        <input type="text" class="task-content" placeholder="Escreva uma tarefa..." value="${task.description}">
        <div class="task-actions">
            <div class="task-btn complete" title="Complete">✓</div>
            <div class="task-btn delete" title="Delete">✕</div>
        </div>
    `;
    
    // Add event listeners
    const completeBtn = taskElement.querySelector('.task-btn.complete');
    const deleteBtn = taskElement.querySelector('.task-btn.delete');
    const contentInput = taskElement.querySelector('.task-content');
    
    completeBtn.addEventListener('click', () => toggleTaskCompletion(timeBlock, index));
    deleteBtn.addEventListener('click', () => deleteTask(timeBlock, index));
    contentInput.addEventListener('change', (e) => updateTaskDescription(timeBlock, index, e.target.value));
    
    return taskElement;
}

// Add a new task
function addTask(timeBlock, difficulty) {
    state.tasks[timeBlock].push({
        description: '',
        difficulty: difficulty,
        completed: false
    });
    saveState();
    renderTasks();

    // Auto-focus on the new task input
    const newTaskInput = tasksContainers[timeBlock].lastChild.querySelector('.task-content');
    if (newTaskInput) {
        newTaskInput.focus();
    }
}

// Toggle task completion
function toggleTaskCompletion(timeBlock, index) {
    const task = state.tasks[timeBlock][index];
    task.completed = !task.completed;
    
    // Update XP
    if (task.completed) {
        state.dayXP += task.difficulty;
    } else {
        state.dayXP -= task.difficulty;
    }
    
    saveState();
    renderTasks();
    updateXPCounters();
}

// Update task description
function updateTaskDescription(timeBlock, index, description) {
    state.tasks[timeBlock][index].description = description;
    saveState();
}

// Delete task
function deleteTask(timeBlock, index) {
    const task = state.tasks[timeBlock][index];
    
    // If task was completed, remove its XP
    if (task.completed) {
        state.dayXP -= task.difficulty;
    }
    
    state.tasks[timeBlock].splice(index, 1);
    saveState();
    renderTasks();
    updateXPCounters();
}

// Save day (reset daily tasks but preserve XP)
function saveDay() {
    state.totalXP += state.dayXP;
    state.dayXP = 0;
    
    // Reset all tasks to incomplete
    for (const timeBlock in state.tasks) {
        state.tasks[timeBlock].forEach(task => {
            task.completed = false;
        });
    }
    
    saveState();
    renderTasks();
    updateXPCounters();
    
    // Show confirmation
    const saveBtn = document.getElementById('save-day-btn');
    const originalHTML = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="icon">✓</span> Dia Salvo!';
    setTimeout(() => {
        saveBtn.innerHTML = originalHTML;
    }, 2000);
}

// Reset total XP with confirmation
function resetTotalXP() {
    // Show confirmation modal
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = 'flex';
    
    // Set up event listeners for modal buttons
    document.getElementById('modal-cancel').onclick = () => {
        modal.style.display = 'none';
    };
    
    document.getElementById('modal-confirm').onclick = () => {
        state.totalXP = 0;
        saveState();
        updateXPCounters();
        modal.style.display = 'none';
        
        // Show confirmation
        const resetBtn = document.getElementById('reset-total-btn');
        const originalHTML = resetBtn.innerHTML;
        resetBtn.innerHTML = '<span class="icon">✓</span> Total Resetado!';
        setTimeout(() => {
            resetBtn.innerHTML = originalHTML;
        }, 2000);
    };
}

// Setup event listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            activateTab(tabId);
            state.activeTab = tabId;
            saveState();
        });
    });
    
    // Add task buttons
    document.querySelectorAll('.add-task-btn').forEach(button => {
        button.addEventListener('click', () => {
            const timeBlock = button.dataset.time;
            const difficulty = parseInt(button.dataset.difficulty);
            addTask(timeBlock, difficulty);
        });
    });
    
    // Save day button
    document.getElementById('save-day-btn').addEventListener('click', saveDay);
    
    // Reset total button
    document.getElementById('reset-total-btn').addEventListener('click', resetTotalXP);
    
    // Notes functionality
    document.querySelector('.add-note-btn').addEventListener('click', addNewNote);
    
    // Rules functionality
    document.querySelectorAll('.rule-item').forEach((item, index) => {
        item.addEventListener('click', () => toggleRule(index));
    });
    document.querySelector('.clear-rules-btn').addEventListener('click', clearRules);
    
    // Update button
    updateBtn.addEventListener('click', handleManualUpdate);
    document.getElementById('update-now-btn').addEventListener('click', handleManualUpdate);
    document.getElementById('dismiss-update-btn').addEventListener('click', () => {
        updateNotification.style.display = 'none';
    });
    
    // Close modal when clicking outside
    document.getElementById('confirmation-modal').addEventListener('click', (e) => {
        if (e.target.id === 'confirmation-modal') {
            e.target.style.display = 'none';
        }
    });
}

// Notes system
function renderNotes() {
    notesContainer.innerHTML = '';
    if (state.notes.length === 0) {
        notesContainer.innerHTML = '<div class="empty-notes">Nenhuma anotação ainda. Clique no + para adicionar uma.</div>';
    }
    state.notes.forEach((noteText, index) => {
        const noteElement = createNoteElement(noteText, index);
        notesContainer.appendChild(noteElement);
    });
}

function createNoteElement(noteText, index) {
    const noteElement = document.createElement('div');
    noteElement.className = 'note';
    noteElement.innerHTML = `
        <textarea class="note-content" placeholder="Escreva uma anotação aqui...">${noteText}</textarea>
        <button class="note-delete">✕</button>
    `;
    
    const deleteBtn = noteElement.querySelector('.note-delete');
    const contentTextarea = noteElement.querySelector('.note-content');
    
    deleteBtn.addEventListener('click', () => deleteNote(index));
    contentTextarea.addEventListener('input', (e) => updateNoteContent(index, e.target.value));
    
    return noteElement;
}

function addNewNote() {
    state.notes.push('');
    saveState();
    renderNotes();
    
    // Find the newly created textarea and focus on it
    const newNoteTextarea = notesContainer.lastChild.querySelector('.note-content');
    if (newNoteTextarea) {
        newNoteTextarea.focus();
    }
}

function updateNoteContent(index, content) {
    state.notes[index] = content;
    saveState();
}

function deleteNote(index) {
    const noteElement = notesContainer.children[index];
    noteElement.style.transform = 'scale(0.9)';
    noteElement.style.opacity = '0';
    setTimeout(() => {
        state.notes.splice(index, 1);
        saveState();
        renderNotes();
    }, 300);
}

// Rules system
function renderRules() {
    const ruleItems = document.querySelectorAll('.rule-item');
    state.rules.forEach((isCompleted, index) => {
        if (isCompleted) {
            ruleItems[index].classList.add('completed');
        } else {
            ruleItems[index].classList.remove('completed');
        }
    });
}

function toggleRule(index) {
    state.rules[index] = !state.rules[index];
    saveState();
    renderRules();
}

function clearRules() {
    state.rules = Array(10).fill(false);
    saveState();
    renderRules();
}

// Tab Activation
function activateTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}