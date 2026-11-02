// Content script injected into the FamilySearch SourceBox tab.
// Opens the "Create Source" form and fills it with data gathered from DigitalArkivet.
// Problems are reported back to background.js ('fillFormError'), which shows a notification.

const FIELD_SELECTORS = {
  date: 'input[data-testid="source-date-field"]',
  title: 'input[data-testid="source-title-field"]',
  url: 'input[data-testid="source-web-page-field"]',
  citation: 'textarea[data-testid="source-citation-field"]',
  notes: 'textarea[data-testid="source-notes-field"]'
};

function reportError(message) {
  console.error('arkivet2fs: ' + message);
  chrome.runtime.sendMessage({ action: 'fillFormError', message: message });
}

// Wait for a DOM element to appear; calls onTimeout if it doesn't within timeoutMs
function waitForElement(selector, callback, onTimeout, timeoutMs = 10000) {
  const startTime = Date.now();
  const intervalId = setInterval(() => {
    const element = document.querySelector(selector);
    if (element) {
      clearInterval(intervalId);
      callback(element);
    } else if (Date.now() - startTime > timeoutMs) {
      clearInterval(intervalId);
      onTimeout();
    }
  }, 100); // Check every 100ms
}

// Set a field's value and dispatch the events FamilySearch's React UI listens for
function setFieldValue(element, value) {
  element.value = value || '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}

function fillSourceForm(data) {
  const missing = [];
  for (const [key, selector] of Object.entries(FIELD_SELECTORS)) {
    const element = document.querySelector(selector);
    if (element) {
      setFieldValue(element, data[key]);
    } else {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    reportError('Some form fields were not found and were left empty: ' + missing.join(', '));
  }
  console.log('arkivet2fs: Form fields filled');
}

function openSourceForm(data) {
  console.log('arkivet2fs: Received data:', data);

  // A signed-out user is redirected away from the SourceBox (e.g. to the sign-in page)
  if (!/\/sources\/sourcebox/i.test(location.pathname)) {
    reportError('FamilySearch did not open the SourceBox. Please sign in to FamilySearch and try again.');
    return;
  }

  // Click "Create Source", then wait for the form (its Cancel button) to appear
  waitForElement('[data-testid="source-box-create-source-button"]', (createSourceButton) => {
    createSourceButton.click();
    console.log('arkivet2fs: Create Source button clicked');

    waitForElement('button[data-testid="source-cancel-button"]', () => {
      console.log('arkivet2fs: Create Source form open');
      // Give the form time to finish rendering before filling it
      setTimeout(() => fillSourceForm(data), 2000);
    }, () => reportError('The Create Source form did not open on FamilySearch.'));
  }, () => reportError('Could not find the "Create Source" button on FamilySearch. Are you signed in?'));
}

// Listen for the fillForm message from background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillForm') {
    openSourceForm(request.data);
  }
  sendResponse({ status: 'received' });
});
