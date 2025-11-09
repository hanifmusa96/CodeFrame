import { $, setVar } from './util.js';
import { pasteCode } from './code.js';
import { takeSnap, cameraFlashAnimation, setSnapScale } from './snap.js';

const navbarNode = $('#navbar');
const windowControlsNode = $('#window-controls');
const windowTitleNode = $('#window-title');
const snippetContainer = $('#snippet-container');
const btnSave = $('#save');

let config;
let externalStyleNode = null;

btnSave.addEventListener('click', () => takeSnap(config));

document.addEventListener('copy', () => takeSnap({ ...config, shutterAction: 'copy' }));

document.addEventListener('paste', (e) => pasteCode(config, e.clipboardData));

/**
 * Handles incoming messages from the VS Code extension.
 * Updates the UI or triggers animations based on the message type.
 * @param {MessageEvent} event - The message event containing data from the extension.
 */
window.addEventListener('message', ({ data: { type, ...cfg } }) => {
  if (type === 'update') {
    config = cfg;

    const {
      fontLigatures,
      tabSize,
      backgroundColor,
      boxShadow,
      containerPadding,
      roundedCorners,
      showWindowControls,
      showWindowTitle,
      windowTitle,
      snapScale
    } = config;

    // Set the snapshot scale factor
    if (snapScale !== undefined) {
      setSnapScale(snapScale);
    }

    setVar('ligatures', fontLigatures ? 'normal' : 'none');
    if (typeof fontLigatures === 'string') setVar('font-features', fontLigatures);
    setVar('tab-size', tabSize);
    setVar('container-background-color', backgroundColor);
    setVar('box-shadow', boxShadow);
    setVar('container-padding', containerPadding);
    setVar('window-border-radius', roundedCorners ? '4px' : 0);

    navbarNode.hidden = !showWindowControls && !showWindowTitle;
    windowControlsNode.hidden = !showWindowControls;
    windowTitleNode.hidden = !showWindowTitle;

    windowTitleNode.textContent = windowTitle;

    // handle external CSS (scoped to #snippet-container)
    if (config.useExternalCss && config.externalCss) {
      if (!externalStyleNode) {
        externalStyleNode = document.createElement('style');
        externalStyleNode.setAttribute('data-external-css', '');
        snippetContainer.appendChild(externalStyleNode);
      }
      externalStyleNode.textContent = config.externalCss;
    } else {
      // fall back to background color silently
      if (externalStyleNode && externalStyleNode.parentNode) externalStyleNode.remove();
      externalStyleNode = null;
      setVar('container-background-color', backgroundColor);
    }

    document.execCommand('paste');
  } else if (type === 'flash') {
    cameraFlashAnimation();
  }
});

export { config };
