const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const Store = require('electron-store');

const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools(); // Remove this line for production
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'] }
    ]
  });
  return result.filePaths;
});

ipcMain.handle('analyze-image', async (event, imagePath) => {
  try {
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const apiKey = store.get('anthropicApiKey');
    if (!apiKey) {
      throw new Error('API key not set');
    }

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: "claude-3-opus-20240229",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this image and provide the following:\n1. A concise title (max 10 words)\n2. A detailed description (2-3 sentences)\n3. A list of relevant keywords (5-10 words, comma-separated)\nFormat your response exactly as follows:\nTitle: [Your title here]\nDescription: [Your description here]\nKeywords: [Your keywords here]"
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: base64Image
            }
          }
        ]
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
});

ipcMain.handle('save-api-key', async (event, apiKey) => {
  store.set('anthropicApiKey', apiKey);
});

ipcMain.handle('get-api-key', async () => {
  return store.get('anthropicApiKey');
});
