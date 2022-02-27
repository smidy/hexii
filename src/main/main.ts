/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, globalShortcut } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { uIOhook, UiohookKey } from 'uiohook-napi';

// import ioHook from 'iohook';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

const ks = require('node-key-sender');

const child = require('child_process').execFile;

const keycodeMap = new Map(Object.entries(UiohookKey).map((_) => [_[1], _[0]]));

let keys: string;

const colorHexIndex: { [name: string]: string } = {
  black: '#000000',
};

function ColorContains(colorString: string): boolean {
  let returnValue = false;
  Object.entries(colorHexIndex).forEach(([key, value]) => {
    if (key.includes(colorString)) {
      returnValue = true;
    }
  });
  return returnValue;
}

function CheckKeys(keyString: string): boolean {
  const colorname = keyString.toLocaleLowerCase();
  if (ColorContains(keyString.toLocaleLowerCase())) {
    const colorHex = colorHexIndex[colorname];
    if (colorHex != null) {
      for (let i = 0; i < colorname.length; i += 1) {
        ks.sendKey('back_space');
      }
      ks.sendKeys(colorHex);
    }
  }
  if ('black'.toLowerCase().includes(keyString)) {
    return true;
  }
  return false;
}

uIOhook.on('keydown', (e) => {
  keys += keycodeMap.get(e.keycode as any)?.toLocaleLowerCase();
  if (!CheckKeys(keys)) {
    uIOhook.stop();
  }
});

// eslint-disable-next-line promise/catch-or-return
app.whenReady().then(() => {
  // Register a 'CommandOrControl+X' shortcut listener.
  const ret = globalShortcut.register('$', () => {
    keys = '';
    uIOhook.start();
  });

  if (!ret) {
    console.log('registration failed');
  }
  return 0;
});

app.on('will-quit', () => {
  // Unregister a shortcut.
  globalShortcut.unregister('$');

  // Unregister all shortcuts.
  globalShortcut.unregisterAll();
});

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

// const executablePath = 'notepad.exe';

// child(executablePath, (err: any, data: { toString: () => any }) => {
//   if (err) {
//     console.error(err);
//     return;
//   }

//   console.log(data.toString());
// });

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDevelopment) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
