// Function to fill the Create Source form with selected information
function openSourceForm(data) {
  console.log('Received data:', data);

  // Wait for a DOM element to appear
  function waitForElement(selector, callback) {
    const intervalId = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(intervalId);
        callback(element);
      }
    }, 100); // Check every 100ms
  }

  function fillSourceForm(data) {
    const dateInput = document.querySelector('input[data-testid="source-date-field"]');
    const titleInput = document.querySelector('input[data-testid="source-title-field"]');
    const urlInput = document.querySelector('input[data-testid="source-web-page-field"]');
    const citationTextarea = document.querySelector('textarea[data-testid="source-citation-field"]');
    const notesTextarea = document.querySelector('textarea[data-testid="source-notes-field"]');

    if (dateInput) {
      dateInput.value = data.date;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (titleInput) {
      titleInput.value = data.title;
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput.dispatchEvent(new Event('change', { bubbles: true }));
      titleInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (urlInput) {
      urlInput.value = data.url;
      urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      urlInput.dispatchEvent(new Event('change', { bubbles: true }));
      urlInput.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (citationTextarea) {
      citationTextarea.value = data.citation;
      citationTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      citationTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      citationTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    if (notesTextarea) {
      notesTextarea.value = data.notes;
      notesTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      notesTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      notesTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }

  // Wait for the button to appear
  waitForElement('[data-testid="source-box-create-source-button"]', (createSourceButton) => {
    // Click the "Create Source" button
    if (createSourceButton) {
      createSourceButton.click();
      console.log('Create Source button clicked');
    } else {
      console.log('Create Source button not found');
    }
  });

  // Wait for the form to appear
  waitForElement('button[data-testid="source-cancel-button"]', (createSourceForm) => {
    console.log('Create Source Form open');
    setTimeout(() => {
      // Fill the form with selected information
      fillSourceForm(data);
      console.log('Form fields filled');
    }, 2000); // Adjust the timeout as necessary to allow the page to complete loading
  });
}

// Listen for messages from the popup script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fillForm') {
    openSourceForm(request.data);
  }
  // Send response back to popup.js
  sendResponse({status: 'success'});
});
