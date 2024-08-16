const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const Store = require('electron-store');

const store = new Store();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools(); // Uncomment for debugging
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('select-images', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'raw', 'cr2', 'nef', 'arw'] }
    ]
  });
  return result.filePaths;
});

ipcMain.handle('analyze-images', async (event, imagePaths) => {
  const apiKey = store.get('anthropicApiKey');
  if (!apiKey) {
    throw new Error('API key not set');
  }

  const results = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const imagePath = imagePaths[i];
    try {
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');

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

      results.push({
        path: imagePath,
        content: response.data.content[0].text
      });

      // Send progress update
      event.sender.send('analysis-progress', {
        current: i + 1,
        total: imagePaths.length
      });
    } catch (error) {
      console.error('Error analyzing image:', error);
      results.push({
        path: imagePath,
        error: error.message
      });
    }
  }

  return results;
});

ipcMain.handle('save-api-key', async (event, apiKey) => {
  store.set('anthropicApiKey', apiKey);
});

ipcMain.handle('get-api-key', async () => {
  return store.get('anthropicApiKey');
});

ipcMain.handle('export-results', async (event, results) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Results',
    defaultPath: 'metadata_results.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (filePath) {
    await fs.writeFile(filePath, JSON.stringify(results, null, 2));
    return true;
  }
  return false;
});
