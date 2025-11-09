'use strict';

const fs = require('fs').promises;
const path = require('path');
const vscode = require('vscode');
const { homedir } = require('os');
const { readHtml, readExternalCss, writeFile, getSettings } = require('./util');

/**
 * Retrieves the configuration settings for the CodeFrame extension.
 * Combines editor settings and extension-specific settings.
 * @returns {Object} Configuration object containing settings and metadata.
 */
const getConfig = async (context) => {
  const editorSettings = getSettings('editor', ['fontLigatures', 'tabSize']);
  const editor = vscode.window.activeTextEditor;
  if (editor) editorSettings.tabSize = editor.options.tabSize;

  let extensionSettings = getSettings('codeframe', [
    'action.shutterAction',
    'action.target',
    'background.backgroundColor',
    'background.externalCssPath',
    'background.transparentBackground',
    'background.useExternalCss',
    'code.realLineNumbers',
    'code.showLineNumbers',
    'container.boxShadow',
    'container.containerPadding',
    'container.roundedCorners',
    'container.showWindowControls',
    'container.showWindowTitle',
    'screenshot.snapScale'
  ]);

  const updatedExtensionSettings = {};
  for (const [key, value] of Object.entries(extensionSettings)) {
    const newKey = key.substring(key.indexOf('.') + 1);
    updatedExtensionSettings[newKey] = value;
  }
  extensionSettings = updatedExtensionSettings;

  const selection = editor?.selection;
  const startLine = extensionSettings.realLineNumbers ? (selection?.start.line ?? 0) : 0;

  let windowTitle = '';
  if (editor && extensionSettings.showWindowTitle) {
    const activeFileName = editor.document.uri.path.split('/').pop();
    windowTitle = `${vscode.workspace.name} - ${activeFileName}`;
  }

  const baseCfg = {
    ...editorSettings,
    ...extensionSettings,
    startLine,
    windowTitle
  };

  const cssResult = await readExternalCss(baseCfg);
  return { ...baseCfg, ...cssResult };
};

/**
 * Creates a webview panel for the CodeFrame extension.
 * @param {vscode.ExtensionContext} context - The extension context.
 * @returns {Promise<vscode.WebviewPanel>} The created webview panel.
 */
const createPanel = async (context) => {
  const panel = vscode.window.createWebviewPanel(
    'codeframe',
    'CodeFrame 📸',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'webview')),
        vscode.Uri.file(path.join(context.extensionPath, 'node_modules'))
      ]
    }
  );

  const htmlPath = path.join(context.extensionPath, 'webview', 'index.html');
  panel.webview.html = await readHtml(htmlPath, panel);

  return panel;
};

let lastUsedImageUri = vscode.Uri.file(path.resolve(homedir(), 'Desktop/code.png'));
const saveImage = async (data) => {
  const uri = await vscode.window.showSaveDialog({
    filters: { Images: ['png'] },
    defaultUri: lastUsedImageUri
  });
  lastUsedImageUri = uri;
  if (uri) await writeFile(uri.fsPath, Buffer.from(data, 'base64'));
};

const hasOneSelection = (selections) => selections?.length === 1 && !selections[0].isEmpty;

const runCommand = async (context) => {
  const panel = await createPanel(context);

  const update = async () => {
    await vscode.commands.executeCommand('editor.action.clipboardCopyWithSyntaxHighlightingAction');
    const cfg = await getConfig(context);
    panel.webview.postMessage({ type: 'update', ...cfg });

    // notify user in VS Code about the CSS processing/read error
    if (cfg.externalCssError) {
      const openAction = 'Open CSS';
      const msg = `CodeFrame: failed to load external CSS — ${cfg.externalCssError}`;
      if (cfg.externalCssResolvedPath) {
        vscode.window.showErrorMessage(msg, openAction).then((sel) => {
          if (sel === openAction) {
            vscode.workspace
              .openTextDocument(cfg.externalCssResolvedPath)
              .then((doc) => vscode.window.showTextDocument(doc));
          }
        });
      } else {
        vscode.window.showErrorMessage(msg);
      }
    }
  };

  const flash = () => panel.webview.postMessage({ type: 'flash' });

  panel.webview.onDidReceiveMessage(async ({ type, data }) => {
    if (type === 'save') {
      flash();
      await saveImage(data);
    } else {
      vscode.window.showErrorMessage(`CodeFrame 📸: Unknown shutterAction "${type}"`);
    }
  });

  const selectionHandler = vscode.window.onDidChangeTextEditorSelection(
    (e) => hasOneSelection(e.selections) && update()
  );
  panel.onDidDispose(() => selectionHandler.dispose());

  const editor = vscode.window.activeTextEditor;
  if (editor && hasOneSelection(editor.selections)) update();
};

exports.activate = (context) => {
  context.subscriptions.push(
    vscode.commands.registerCommand('codeframe.start', () => runCommand(context))
  );

  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
  statusBarItem.text = '$(device-camera) CodeFrame';
  statusBarItem.tooltip = 'Capture Code';
  statusBarItem.command = 'codeframe.start';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
};
